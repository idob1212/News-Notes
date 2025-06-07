from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime # Added import
import os
import time
from dotenv import load_dotenv
import re # Keep for now, might be used by other parts or future parsing
from pymongo import MongoClient

from langchain_community.retrievers.you import YouRetriever
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser

# Load environment variables from .env file
load_dotenv()

# Check if API key is available
perplexity_api_key = os.getenv("PERPLEXITY_API_KEY")
if not perplexity_api_key:
    print("Warning: PERPLEXITY_API_KEY not found in environment variables.")

# Updated to use YDC_API_KEY as per official LangChain documentation
ydc_api_key = os.getenv("YDC_API_KEY")

openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    print("Warning: OPENAI_API_KEY not found in environment variables.")

# Check if at least one API key is available
if not any([perplexity_api_key, ydc_api_key, openai_api_key]):
    raise ValueError("At least one API key (PERPLEXITY_API_KEY, YDC_API_KEY, or OPENAI_API_KEY) must be set in environment variables.")

app = FastAPI()


# Add CORS middleware to allow requests from Chrome extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify extension ID instead of *
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define issue model for the response
class Issue(BaseModel):
    text: str = Field(description="The exact text that contains the issue")
    explanation: str = Field(description="A clear explanation of why it's misleading or false")
    confidence_score: float = Field(description="Confidence score (0.0-1.0) for the assessment")
    source_urls: Optional[List[str]] = Field(default=None, description="URLs of sources that contradict the claim")

# Define structured output for the analysis
class AnalysisOutput(BaseModel):
    issues: List[Issue] = Field(description="List of problematic sections with text, explanation, and confidence score")

# Define request model
class ArticleRequest(BaseModel):
    title: str
    content: str
    url: str

# Define response model
class AnalysisResponse(BaseModel):
    issues: List[Issue]

# Define Article Analysis Document model for storage
class ArticleAnalysisDocument(BaseModel):
    url: str  # Unique ID for the document
    title: str
    content: str
    issues: List[Issue]
    created_at: datetime = Field(default_factory=datetime.utcnow)

def split_into_paragraphs(content: str) -> List[str]:
    """
    Split article content into meaningful paragraphs using multiple strategies.
    Handles various text formats including HTML-like content, inconsistent newlines, etc.
    """
    if not content or not content.strip():
        return []
    
    # Clean up the content first
    content = content.strip()
    
    # Strategy 1: Try HTML paragraph tags first
    if '<p>' in content.lower() or '</p>' in content.lower():
        # Extract content from HTML paragraph tags
        import re
        html_paragraphs = re.findall(r'<p[^>]*>(.*?)</p>', content, re.DOTALL | re.IGNORECASE)
        if html_paragraphs:
            paragraphs = []
            for p in html_paragraphs:
                # Remove HTML tags from paragraph content
                clean_p = re.sub(r'<[^>]+>', '', p).strip()
                if clean_p and len(clean_p) > 30:  # Minimum length for meaningful paragraph
                    paragraphs.append(clean_p)
            if paragraphs:
                return paragraphs
    
    # Strategy 2: Split on double newlines (traditional approach)
    double_newline_split = [p.strip() for p in content.split('\n\n') if p.strip()]
    if len(double_newline_split) > 1:
        # Filter out very short segments
        meaningful_paragraphs = [p for p in double_newline_split if len(p) > 50]
        if meaningful_paragraphs:
            return meaningful_paragraphs
    
    # Strategy 3: Split on single newlines and group sentences
    lines = [line.strip() for line in content.split('\n') if line.strip()]
    if len(lines) > 1:
        paragraphs = []
        current_paragraph = []
        min_sentences_per_paragraph = 2
        
        for line in lines:
            current_paragraph.append(line)
            
            # Count sentences in current paragraph (rough estimate)
            sentence_count = len([s for s in line.split('.') if s.strip()]) - 1
            paragraph_text = ' '.join(current_paragraph)
            
            # Create paragraph if we have enough content or hit certain patterns
            if (sentence_count >= min_sentences_per_paragraph and len(paragraph_text) > 100) or \
               len(paragraph_text) > 300:
                paragraphs.append(paragraph_text)
                current_paragraph = []
        
        # Add remaining content as final paragraph
        if current_paragraph:
            final_paragraph = ' '.join(current_paragraph)
            if len(final_paragraph) > 50:
                paragraphs.append(final_paragraph)
        
        if len(paragraphs) > 1:
            return paragraphs
    
    # Strategy 4: Split by sentence patterns (fallback for very dense text)
    import re
    sentences = re.split(r'(?<=[.!?])\s+', content)
    if len(sentences) > 3:
        paragraphs = []
        current_paragraph = []
        sentences_per_paragraph = max(3, len(sentences) // 5)  # Aim for 5 paragraphs max
        
        for i, sentence in enumerate(sentences):
            current_paragraph.append(sentence)
            
            if len(current_paragraph) >= sentences_per_paragraph or i == len(sentences) - 1:
                paragraph_text = ' '.join(current_paragraph)
                if len(paragraph_text) > 50:
                    paragraphs.append(paragraph_text)
                current_paragraph = []
        
        if len(paragraphs) > 1:
            return paragraphs
    
    # Strategy 5: Fallback - treat entire content as one paragraph if it's substantial
    if len(content) > 100:
        return [content]
    
    # Last resort - return empty list if content is too short
    return []

# MongoDB setup
mongodb_connection_string = os.getenv("MONGODB_CONNECTION_STRING")
if not mongodb_connection_string:
    raise ValueError("MONGODB_CONNECTION_STRING not found in environment variables.")

try:
    mongo_client = MongoClient(mongodb_connection_string)
    mongo_db = mongo_client.news_fact_checker_db # Or your preferred DB name
    article_analyses_collection = mongo_db.article_analyses # Or your preferred collection name
    # You can add a test connection here if needed, e.g., by calling mongo_client.admin.command('ping')
    print("Successfully connected to MongoDB.")
except Exception as e:
    raise RuntimeError(f"Could not connect to MongoDB: {e}")


@app.get("/")
async def root():
    return {"message": "News Fact-Checker API"}

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_article(article: ArticleRequest):
    start_time = time.time()
    
    try:
        print(f"[DEBUG] Starting analysis for URL: {article.url}")
        
        # Check if the article analysis is already cached in MongoDB
        cached_analysis_doc = article_analyses_collection.find_one({"url": article.url})

        if cached_analysis_doc:
            # Convert issue dicts back to Issue Pydantic models
            issues_from_db = [Issue(**issue_data) for issue_data in cached_analysis_doc.get("issues", [])]
            print(f"Returning cached analysis for URL: {article.url} (took {time.time() - start_time:.2f} seconds)")
            return AnalysisResponse(issues=issues_from_db)

        # If not cached, proceed with new analysis using You.com search + LLM
        print(f"No cache found for URL: {article.url}. Performing new analysis.")

        # Step 1: Split article into paragraphs using improved logic
        paragraphs = split_into_paragraphs(article.content)
        print(f"Split article into {len(paragraphs)} paragraphs")
        
        paragraph_search_results = {}
        
        if ydc_api_key:
            try:
                print("Using You.com retriever to fact-check each paragraph...")
                # Configure YouRetriever with proper parameters:
                # - num_web_results: Controls total hits returned (max 20)
                # - n_snippets_per_hit: Controls snippets per hit (only works with search endpoint)
                # - endpoint_type: Use 'search' (rag endpoint requires special permissions)
                retriever = YouRetriever(
                    num_web_results=5,  # Limit to 5 results per query
                    n_snippets_per_hit=3,  # 3 snippets per hit for more content (only works with search)
                    endpoint_type='search'  # Use search endpoint (rag needs special API access)
                )
                
                for i, paragraph in enumerate(paragraphs):
                    # Paragraphs are already filtered for meaningful length in split_into_paragraphs()
                    # but we can still skip extremely short ones as a safety check
                    if len(paragraph) < 30:
                        continue
                        
                    try:
                        # Create fact-checking search query for this paragraph
                        # Truncate paragraph to avoid overly long queries
                        truncated_paragraph = paragraph[:200] + "..." if len(paragraph) > 200 else paragraph
                        search_query = f"fact check verify: {truncated_paragraph}"
                        search_response = retriever.invoke(search_query)
                        
                        # Store search results for this paragraph
                        paragraph_results = []
                        for doc in search_response:
                            paragraph_results.append({
                                "title": doc.metadata.get('title', 'Unknown'),
                                "url": doc.metadata.get('url', 'Unknown'),
                                "content": doc.page_content  # Should now contain more complete content
                            })
                        
                        paragraph_search_results[i] = {
                            "paragraph": paragraph,
                            "search_results": paragraph_results
                        }
                        
                        print(f"Found {len(paragraph_results)} search results for paragraph {i+1}")
                        
                        # Add small delay to avoid rate limiting
                        time.sleep(0.5)
                        
                    except Exception as e:
                        print(f"Search failed for paragraph {i+1}: {e}")
                        paragraph_search_results[i] = {
                            "paragraph": paragraph,
                            "search_results": []
                        }
                
                print(f"Completed searches for {len(paragraph_search_results)} paragraphs")
            except Exception as e:
                print(f"You.com retriever initialization failed: {e}")
                # Fallback: treat entire article as one paragraph
                paragraph_search_results = {0: {"paragraph": article.content, "search_results": []}}
        else:
            print("No You.com API key available, proceeding without search results")
            paragraph_search_results = {0: {"paragraph": article.content, "search_results": []}}

        # Step 2: Set up LLM for analysis
        llm = None
        llm_name = "Unknown"
        
        # Prioritize OpenAI GPT-4 Turbo (GPT-4.1) over Perplexity
        if openai_api_key:
            from langchain_openai import ChatOpenAI
            openai_llm = ChatOpenAI(model="gpt-4.1-2025-04-14", temperature=0)
            llm = openai_llm
            llm_name = "OpenAI GPT-4.1"
            print(f"Using OpenAI GPT-4.1 for analysis")
        
        if llm is None and perplexity_api_key:
            from langchain_perplexity import ChatPerplexity
            perplexity_llm = ChatPerplexity(pplx_api_key=perplexity_api_key, model="llama-3.1-sonar-small-128k-online")
            llm = perplexity_llm
            llm_name = "Perplexity"
            print(f"Using Perplexity for analysis")
        
        if llm is None:
            raise HTTPException(status_code=500, detail="No working LLM available. Please check your API keys.")

        output_parser = PydanticOutputParser(pydantic_object=AnalysisOutput)

        prompt_template_str = """
Current Date: {current_date}

Analyze the following paragraph from a news article to identify any misleading statements, factual inaccuracies, or biased reporting.
Use the provided search results from You.com to verify claims and identify contradictions.

IMPORTANT: Do NOT flag content as problematic simply because it discusses future events, predictions, or information that occurred after your training data cutoff. Only flag content that contains actual factual inaccuracies or misleading statements that can be verified against reliable sources.

STUDY COMPARISON GUIDANCE: When the article compares or contrasts different studies, research findings, or statistical data, ensure that the comparisons are valid by checking:
- Whether the studies used the same or comparable datasets
- Whether the studies were conducted during the same time period or are temporally relevant for comparison  
- Whether the methodologies and sample sizes are comparable
- Flag misleading comparisons where studies with different data sources, time periods, or methodologies are incorrectly presented as directly comparable

For each identified issue, please provide:
1. The exact text segment from the paragraph that contains the issue. Call this field 'text'.
2. A concise explanation of why this segment is problematic. Call this field 'explanation'.
3. A list of URLs to credible sources that support your explanation. Call this field 'source_urls'.
4. A confidence score (0.0-1.0) for your assessment. Call this field 'confidence_score'. If not directly calculable, use 1.0 for high confidence findings.

Article Title: {article_title}
Article URL: {article_url}

Paragraph Analysis with Search Results:
{paragraph_search_results}

{format_instructions}

Ensure your entire response is a single JSON object matching the Pydantic schema provided in the format instructions.
If no issues are found in this paragraph, the "issues" list should be empty.
Use the search results to support your analysis and include relevant URLs in the source_urls field.
Focus specifically on the content of this paragraph and use the search results to verify its claims.
"""
        # Updated input_variables to include current_date
        prompt = PromptTemplate(
            template=prompt_template_str,
            input_variables=["current_date", "article_title", "article_url", "paragraph_search_results"],
            partial_variables={"format_instructions": output_parser.get_format_instructions()},
        )

        # Process each paragraph individually and combine results
        all_issues = []
        
        print(f"[DEBUG] Processing {len(paragraph_search_results)} paragraphs individually with {llm_name}")
        
        for i, data in paragraph_search_results.items():
            try:
                print(f"[DEBUG] Analyzing paragraph {i+1}/{len(paragraph_search_results)}")
                
                # Format search results for this specific paragraph
                formatted_paragraph_results = f"--- PARAGRAPH {i+1} ---\n"
                formatted_paragraph_results += f"Content: {data['paragraph']}\n\n"
                formatted_paragraph_results += f"Search Results for fact-checking this paragraph:\n"
                
                if data['search_results']:
                    for j, result in enumerate(data['search_results'], 1):
                        formatted_paragraph_results += f"  {j}. Title: {result['title']}\n"
                        formatted_paragraph_results += f"     URL: {result['url']}\n"
                        formatted_paragraph_results += f"     Content: {result['content']}\n\n"
                else:
                    formatted_paragraph_results += "  No search results available for this paragraph.\n\n"
                
                # Make individual call for this paragraph
                chain = prompt | llm | output_parser
                paragraph_result = chain.invoke({
                    "current_date": datetime.now().strftime("%Y-%m-%d"),
                    "article_title": article.title,
                    "article_url": article.url,
                    "paragraph_search_results": formatted_paragraph_results
                })
                
                # Add issues from this paragraph to the combined list
                if paragraph_result.issues:
                    all_issues.extend(paragraph_result.issues)
                    print(f"[DEBUG] Found {len(paragraph_result.issues)} issues in paragraph {i+1}")
                else:
                    print(f"[DEBUG] No issues found in paragraph {i+1}")
                
                # Small delay to avoid rate limiting
                time.sleep(0.5)
                
            except Exception as e:
                print(f"[ERROR] Failed to analyze paragraph {i+1}: {str(e)}")
                # Continue with other paragraphs even if one fails
                continue
        
        # Create combined result
        structured_result = AnalysisOutput(issues=all_issues)
        print(f"[DEBUG] Combined analysis completed, found {len(structured_result.issues)} total issues across all paragraphs")


        # Save the new analysis to MongoDB
        # Ensure structured_result is not None if an error occurred before its assignment
        if structured_result is None:
             # This case should ideally be caught by the exception block above and re-raised.
             # If it somehow gets here, it means an unhandled path.
             raise HTTPException(status_code=500, detail="Analysis failed to produce a result.")

        new_analysis_document = ArticleAnalysisDocument(
            url=article.url,
            title=article.title,
            content=article.content, # Storing full content, consider if truncation is needed for large articles
            issues=structured_result.issues
        )
        
        try:
            article_analyses_collection.insert_one(new_analysis_document.model_dump())
            print(f"Successfully saved analysis for URL: {article.url} to MongoDB.")
        except Exception as e_db:
            print(f"Error saving analysis to MongoDB for URL {article.url}: {e_db}")
            # Decide if you want to raise an error or just log, here we log and continue
            # raise HTTPException(status_code=500, detail=f"Failed to save analysis to database: {e_db}")

        total_time = time.time() - start_time
        print(f"[DEBUG] Total analysis time: {total_time:.2f} seconds")
        return AnalysisResponse(issues=structured_result.issues)
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        total_time = time.time() - start_time
        print(f"[ERROR] Analysis failed after {total_time:.2f} seconds: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True) 