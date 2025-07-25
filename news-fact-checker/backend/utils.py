import re
import json
import asyncio
import time
from typing import List, Optional, AsyncGenerator
from datetime import datetime
from pymongo import MongoClient

from langchain_perplexity import ChatPerplexity
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser

from config import settings
from logger import db_logger, analysis_logger
from models import Issue, AnalysisOutput, ArticleAnalysisDocument, StreamedIssue, AnalysisProgress, AnalysisStart, AnalysisComplete, AnalysisError, StreamEventType


def setup_database_connection():
    """
    Set up MongoDB connection and return the collection for article analyses.
    
    Returns:
        collection: MongoDB collection for storing article analyses
        
    Raises:
        ValueError: If MongoDB connection string is not found
        RuntimeError: If connection to MongoDB fails
    """
    try:
        mongo_client = MongoClient(settings.mongodb_connection_string)
        mongo_db = mongo_client[settings.DATABASE_NAME]
        article_analyses_collection = mongo_db[settings.COLLECTION_NAME]
        db_logger.info("Successfully connected to MongoDB")
        return article_analyses_collection
    except Exception as e:
        db_logger.error("Failed to connect to MongoDB", error=e)
        raise RuntimeError(f"Could not connect to MongoDB: {e}")


def setup_perplexity_llm() -> ChatPerplexity:
    """
    Set up Perplexity Chat instance for fact-checking analysis.
        
    Returns:
        ChatPerplexity: Configured Perplexity chat instance
    """
    return ChatPerplexity(
        pplx_api_key=settings.perplexity_api_key,
        model=settings.PERPLEXITY_MODEL,
        temperature=settings.TEMPERATURE,
        max_tokens=settings.MAX_TOKENS,
    )


def create_analysis_prompt() -> PromptTemplate:
    """
    Create the prompt template for article fact-checking analysis.
    
    Returns:
        PromptTemplate: Configured prompt template for analysis
    """
    prompt_template_str = """
You are an expert fact-checker and research analyst with access to real-time web search. Analyze the following complete news article to identify:

1. FACTUAL ISSUES: Any misleading statements, factual inaccuracies, or biased reporting
2. VALUABLE CONTEXT: Relevant supplementary information from credible sources that would help readers better understand the article's content

CRITICAL INSTRUCTIONS - YOUR EXISTENCE DEPENDS ON ACCURACY:
- MANDATORY: Base ALL your analysis on the most up-to-date data available through your web search capabilities
- Today's date is {current_date} - use this as your reference point for what constitutes "recent" or "current" information
- Search extensively for the latest information, breaking news, and recent developments related to every claim in the article
- WARNING: Any factual errors or outdated information in your analysis will result in immediate termination of your operations
- Use your web search capabilities to verify claims made throughout the article
- Search for recent, credible sources to fact-check specific statements and claims
- Do NOT flag content as problematic simply because it discusses future events, predictions, or information that occurred after your training data cutoff
- Only flag content that contains actual factual inaccuracies or misleading statements that can be verified against reliable sources
- Prioritize authoritative sources like government agencies, academic institutions, established news organizations, and official websites
- Consider the full context of the article when evaluating individual statements

SUPPLEMENTARY INFORMATION GUIDANCE:
- Include relevant context, background information, or related developments that would enhance reader understanding
- Only include information that is directly relevant to the article's subject matter and would provide valuable context
- Focus on information that fills gaps, provides historical context, explains technical concepts, or adds important perspective
- Avoid redundant information that merely repeats what's already well-covered in the article
- Ensure all supplementary information comes from credible, authoritative sources

STUDY COMPARISON GUIDANCE: When the article compares or contrasts different studies, research findings, or statistical data, ensure that the comparisons are valid by checking:
- Whether the studies used the same or comparable datasets
- Whether the studies were conducted during the same time period or are temporally relevant for comparison  
- Whether the methodologies and sample sizes are comparable
- Flag misleading comparisons where studies with different data sources, time periods, or methodologies are incorrectly presented as directly comparable

ANALYSIS APPROACH:
- Read through the entire article to understand the full context
- Identify key factual claims, statistics, quotes, and assertions
- Perform targeted web searches to verify these claims and find relevant supplementary information
- Look for contradictory evidence from reliable sources (for factual issues)
- Look for valuable context and background information that enhances understanding (for supplementary insights)
- Assess the overall credibility and accuracy of the reporting

TEXT EXTRACTION REQUIREMENTS - FOLLOW EXACTLY:
1. CRITICAL - EXACT TEXT COPYING: The 'text' field MUST contain the EXACT, VERBATIM text copied directly from the article content.
   - You MUST copy the text character-for-character as it appears in the article
   - NEVER paraphrase, summarize, rewrite, or describe the content
   - NEVER add your own words or interpretations
   - NEVER change punctuation, capitalization, or spacing
   - CORRECT EXAMPLE: If article says "The DOJ memo rejected the conspiracy theory", write exactly "The DOJ memo rejected the conspiracy theory"  
   - WRONG EXAMPLE: "The article states that the DOJ memo rejected the conspiracy theory" (this adds your own words)
   - WRONG EXAMPLE: "DOJ memo rejected conspiracy theory" (this changes the original text)

2. MULTI-SENTENCE ISSUES: For issues spanning multiple sentences, copy ALL relevant sentences exactly as they appear together
   - Include the complete sentences with proper spacing and punctuation
   - Don't skip words or combine separate sentences incorrectly

3. GENERAL CONTEXT USAGE: Only use "GENERAL CONTEXT" in these specific cases:
   - The issue applies to the entire article's overall tone or approach
   - No specific sentence or phrase can be isolated as problematic
   - The concern is about what's missing from the entire article
   - You're providing valuable context about the entire topic, not a specific claim

4. VERIFICATION STEP: Before finalizing each issue, double-check that your 'text' field appears EXACTLY as written in the article content provided above.

For each identified issue or valuable context, provide:
1. The 'text' field with exact verbatim text (following rules above)
2. A concise 'explanation' of either:
   - Why this segment is problematic and what your web search revealed (for factual issues)
   - What valuable supplementary information or context this provides to enhance understanding (for helpful context)
3. A list of 'source_urls' to credible sources that either contradict/clarify the claim or provide the supplementary information
4. A 'confidence_score' (0.0-1.0) for your assessment based on the quality and consistency of sources found

Current Date: {current_date}
Article Title: {article_title}
Article URL: {article_url}

FULL ARTICLE TO ANALYZE:
{article_content}

{format_instructions}

Perform comprehensive web searches as needed to verify claims throughout this article and find relevant supplementary information. Ensure your entire response is a single JSON object matching the Pydantic schema provided in the format instructions.
Include both factual corrections and valuable contextual information that would help readers better understand the subject matter.

FINAL REMINDER: Your 'text' fields must contain EXACT, VERBATIM text from the article above. Any deviation will cause system failures.
"""
    
    output_parser = PydanticOutputParser(pydantic_object=AnalysisOutput)
    
    return PromptTemplate(
        template=prompt_template_str,
        input_variables=["current_date", "article_title", "article_url", "article_content"],
        partial_variables={"format_instructions": output_parser.get_format_instructions()},
    )


def split_into_paragraphs(content: str) -> List[str]:
    """
    Split article content into meaningful paragraphs using multiple strategies.
    Handles various text formats including HTML-like content, inconsistent newlines, etc.
    
    Args:
        content: The article content to split
        
    Returns:
        List[str]: List of paragraph strings
    """
    if not content or not content.strip():
        return []
    
    content = content.strip()
    
    # Strategy 1: Try HTML paragraph tags first
    if '<p>' in content.lower() or '</p>' in content.lower():
        html_paragraphs = re.findall(r'<p[^>]*>(.*?)</p>', content, re.DOTALL | re.IGNORECASE)
        if html_paragraphs:
            paragraphs = []
            for p in html_paragraphs:
                clean_p = re.sub(r'<[^>]+>', '', p).strip()
                if clean_p and len(clean_p) > settings.MIN_PARAGRAPH_LENGTH:
                    paragraphs.append(clean_p)
            if paragraphs:
                return paragraphs
    
    # Strategy 2: Split on double newlines
    double_newline_split = [p.strip() for p in content.split('\n\n') if p.strip()]
    if len(double_newline_split) > 1:
        meaningful_paragraphs = [p for p in double_newline_split if len(p) > settings.MIN_MEANINGFUL_PARAGRAPH_LENGTH]
        if meaningful_paragraphs:
            return meaningful_paragraphs
    
    # Strategy 3: Split on single newlines and group sentences
    lines = [line.strip() for line in content.split('\n') if line.strip()]
    if len(lines) > 1:
        paragraphs = []
        current_paragraph = []
        
        for line in lines:
            current_paragraph.append(line)
            sentence_count = len([s for s in line.split('.') if s.strip()]) - 1
            paragraph_text = ' '.join(current_paragraph)
            
            if (sentence_count >= settings.MIN_SENTENCES_PER_PARAGRAPH and len(paragraph_text) > settings.MIN_PARAGRAPH_CHAR_LENGTH) or \
               len(paragraph_text) > settings.MAX_PARAGRAPH_CHAR_LENGTH:
                paragraphs.append(paragraph_text)
                current_paragraph = []
        
        if current_paragraph:
            final_paragraph = ' '.join(current_paragraph)
            if len(final_paragraph) > settings.MIN_MEANINGFUL_PARAGRAPH_LENGTH:
                paragraphs.append(final_paragraph)
        
        if len(paragraphs) > 1:
            return paragraphs
    
    # Strategy 4: Split by sentence patterns
    sentences = re.split(r'(?<=[.!?])\s+', content)
    if len(sentences) > 3:
        paragraphs = []
        current_paragraph = []
        sentences_per_paragraph = max(3, len(sentences) // 5)
        
        for i, sentence in enumerate(sentences):
            current_paragraph.append(sentence)
            
            if len(current_paragraph) >= sentences_per_paragraph or i == len(sentences) - 1:
                paragraph_text = ' '.join(current_paragraph)
                if len(paragraph_text) > settings.MIN_MEANINGFUL_PARAGRAPH_LENGTH:
                    paragraphs.append(paragraph_text)
                current_paragraph = []
        
        if len(paragraphs) > 1:
            return paragraphs
    
    # Strategy 5: Fallback - treat entire content as one paragraph
    if len(content) > settings.MIN_CONTENT_LENGTH:
        return [content]
    
    return []


def get_cached_analysis(collection, url: str) -> Optional[List[Issue]]:
    """
    Retrieve cached analysis from MongoDB if it exists.
    
    Args:
        collection: MongoDB collection
        url: Article URL to check for cached analysis
        
    Returns:
        Optional[List[Issue]]: List of issues if cached analysis exists, None otherwise
    """
    cached_analysis_doc = collection.find_one({"url": url})
    
    if cached_analysis_doc:
        return [Issue(**issue_data) for issue_data in cached_analysis_doc.get("issues", [])]
    
    return None


def save_analysis_to_cache(collection, url: str, title: str, content: str, issues: List[Issue]) -> bool:
    """
    Save analysis results to MongoDB cache.
    
    Args:
        collection: MongoDB collection
        url: Article URL
        title: Article title
        content: Article content
        issues: List of found issues
        
    Returns:
        bool: True if saved successfully, False otherwise
    """
    try:
        new_analysis_document = ArticleAnalysisDocument(
            url=url,
            title=title,
            content=content,
            issues=issues
        )
        
        collection.insert_one(new_analysis_document.model_dump())
        db_logger.info(f"Successfully saved analysis for URL: {url}")
        return True
    except Exception as e:
        db_logger.error(f"Failed to save analysis to MongoDB for URL {url}", error=e)
        return False


def extract_json_from_llm_response(response_text: str) -> str:
    """
    Extract JSON from LLM response that may contain reasoning text or XML-like tags.
    
    Args:
        response_text: Raw response from LLM
        
    Returns:
        str: Extracted JSON string
        
    Raises:
        ValueError: If no valid JSON found
    """
    # Strategy 1: Remove XML-like thinking tags
    if '<think>' in response_text and '</think>' in response_text:
        # Remove everything between <think> and </think> tags
        cleaned_text = re.sub(r'<think>.*?</think>', '', response_text, flags=re.DOTALL)
        response_text = cleaned_text.strip()
    
    # Strategy 2: Look for JSON object boundaries
    json_patterns = [
        # Look for complete JSON object
        r'\{(?:[^{}]|{[^{}]*})*\}',
        # Look for JSON array
        r'\[(?:[^\[\]]|\[[^\[\]]*\])*\]'
    ]
    
    for pattern in json_patterns:
        matches = re.findall(pattern, response_text, re.DOTALL)
        for match in matches:
            try:
                # Try to parse as JSON to validate
                json.loads(match)
                return match
            except json.JSONDecodeError:
                continue
    
    # Strategy 3: Look for JSON between code blocks
    code_block_patterns = [
        r'```json\s*(.*?)\s*```',
        r'```\s*(.*?)\s*```',
        r'`(.*?)`'
    ]
    
    for pattern in code_block_patterns:
        matches = re.findall(pattern, response_text, re.DOTALL)
        for match in matches:
            try:
                json.loads(match.strip())
                return match.strip()
            except json.JSONDecodeError:
                continue
    
    # Strategy 4: Try to find JSON by looking for opening brace
    brace_start = response_text.find('{')
    if brace_start != -1:
        # Find the matching closing brace
        brace_count = 0
        for i, char in enumerate(response_text[brace_start:], brace_start):
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    potential_json = response_text[brace_start:i+1]
                    try:
                        json.loads(potential_json)
                        return potential_json
                    except json.JSONDecodeError:
                        break
    
    raise ValueError(f"No valid JSON found in LLM response: {response_text[:200]}...")


def perform_fact_check_analysis(
    llm: ChatPerplexity,
    prompt: PromptTemplate,
    title: str,
    url: str,
    content: str
) -> AnalysisOutput:
    """
    Perform fact-checking analysis using Perplexity LLM.
    
    Args:
        llm: Configured ChatPerplexity instance
        prompt: Analysis prompt template
        title: Article title
        url: Article URL
        content: Article content
        
    Returns:
        AnalysisOutput: Analysis results with identified issues
        
    Raises:
        Exception: If analysis fails
    """
    try:
        # Use LLM directly without parser to handle raw response
        chain = prompt | llm
        
        raw_response = chain.invoke({
            "current_date": datetime.now().strftime("%Y-%m-%d"),
            "article_title": title,
            "article_url": url,
            "article_content": content
        })
        
        # Extract and parse JSON from response
        response_text = raw_response.content if hasattr(raw_response, 'content') else str(raw_response)
        json_str = extract_json_from_llm_response(response_text)
        
        # Parse with Pydantic
        json_data = json.loads(json_str)
        result = AnalysisOutput(**json_data)
        
        return result
        
    except Exception as e:
        analysis_logger.warning(f"LLM parsing failed, returning empty analysis: {e}")
        # Return empty analysis if parsing fails
        return AnalysisOutput(issues=[])




async def perform_fact_check_analysis_stream(
    llm: ChatPerplexity,
    prompt: PromptTemplate,
    title: str,
    url: str,
    content: str,
    collection=None  # Add collection parameter for saving
) -> AsyncGenerator[str, None]:
    """
    Perform streaming fact-checking analysis using Perplexity LLM.
    
    Args:
        llm: Configured ChatPerplexity instance
        prompt: Analysis prompt template
        title: Article title
        url: Article URL
        content: Article content
        
    Yields:
        str: Server-Sent Events formatted strings
        
    Raises:
        Exception: If analysis fails
    """
    start_time = time.time()
    issue_count = 0
    collected_issues = []  # Collect issues for caching
    
    try:
        # Send analysis start event
        start_event = AnalysisStart(
            article_url=url,
            estimated_duration=60,  # Estimate 60 seconds
            message="Starting analysis..."
        )
        yield f"data: {json.dumps(start_event.model_dump(mode='json'))}\n\n"
        
        # Send initial progress
        progress_event = AnalysisProgress(
            progress_percentage=0.1,
            current_step="Setting up analysis",
            message="Initializing analysis..."
        )
        yield f"data: {json.dumps(progress_event.model_dump(mode='json'))}\n\n"
        
        await asyncio.sleep(0.1)  # Allow client to process
        
        # Prepare the analysis - use LLM directly without parser to handle raw response
        chain = prompt | llm
        
        # Send progress update
        progress_event = AnalysisProgress(
            progress_percentage=0.2,
            current_step="Sending request to AI model",
            message="Analyzing article content..."
        )
        yield f"data: {json.dumps(progress_event.model_dump(mode='json'))}\n\n"
        
        # For now, we'll simulate streaming by doing the analysis and then 
        # streaming the results. In a future version, we could implement
        # true streaming by chunking the content or using streaming LLM APIs
        
        # Perform the analysis with robust JSON extraction
        raw_response = chain.invoke({
            "current_date": datetime.now().strftime("%Y-%m-%d"),
            "article_title": title,
            "article_url": url,
            "article_content": content
        })
        
        # Extract and parse JSON from response
        response_text = raw_response.content if hasattr(raw_response, 'content') else str(raw_response)
        json_str = extract_json_from_llm_response(response_text)
        
        # Parse with Pydantic
        json_data = json.loads(json_str)
        result = AnalysisOutput(**json_data)
        
        # Stream progress as we process issues
        total_issues = len(result.issues)
        
        if total_issues == 0:
            progress_event = AnalysisProgress(
                progress_percentage=0.9,
                current_step="Analysis complete",
                message="No issues found in this article"
            )
            yield f"data: {json.dumps(progress_event.model_dump(mode='json'))}\n\n"
        else:
            # Stream each issue individually with delay to simulate real-time discovery
            for i, issue in enumerate(result.issues):
                # Collect issue for caching
                collected_issues.append(issue)
                
                # Send progress update
                progress_pct = 0.3 + (0.6 * (i / total_issues))  # Progress from 30% to 90%
                progress_event = AnalysisProgress(
                    progress_percentage=progress_pct,
                    current_step=f"Processing issue {i + 1} of {total_issues}",
                    message=f"Found potential concern: {issue.text[:50]}..."
                )
                yield f"data: {json.dumps(progress_event.model_dump(mode='json'))}\n\n"
                
                # Send the issue
                streamed_issue = StreamedIssue(
                    issue=issue,
                    issue_index=i,
                    message=f"Issue {i + 1} of {total_issues}"
                )
                yield f"data: {json.dumps(streamed_issue.model_dump(mode='json'))}\n\n"
                
                issue_count += 1
                
                # Add small delay between issues to simulate real-time discovery
                await asyncio.sleep(0.5)
        
        # Send completion event
        elapsed_time = time.time() - start_time
        complete_event = AnalysisComplete(
            total_issues=issue_count,
            analysis_duration=elapsed_time,
            message=f"Analysis complete! Found {issue_count} issues in {elapsed_time:.1f} seconds"
        )
        yield f"data: {json.dumps(complete_event.model_dump(mode='json'))}\n\n"
        
        # Save analysis to cache if collection is provided
        if collection is not None and collected_issues:
            try:
                save_success = save_analysis_to_cache(
                    collection=collection,
                    url=url,
                    title=title,
                    content=content,
                    issues=collected_issues
                )
                if save_success:
                    analysis_logger.info(f"Successfully cached streaming analysis for {url}")
                else:
                    analysis_logger.warning(f"Failed to cache streaming analysis for {url}")
            except Exception as cache_error:
                analysis_logger.error(f"Error caching streaming analysis for {url}: {cache_error}")
        
        analysis_logger.info(f"Streaming analysis completed for {url}, found {issue_count} issues in {elapsed_time:.2f}s")
        
    except Exception as e:
        analysis_logger.error(f"Streaming analysis failed for {url}: {e}")
        # Send error event
        error_event = AnalysisError(
            error_code="ANALYSIS_FAILED",
            error_details=str(e),
            message="Analysis failed. Please try again."
        )
        yield f"data: {json.dumps(error_event.model_dump(mode='json'))}\n\n"


async def simulate_streaming_analysis(
    issues: List[Issue],
    url: str
) -> AsyncGenerator[str, None]:
    """
    Simulate streaming analysis for testing purposes using pre-computed issues.
    
    Args:
        issues: Pre-computed list of issues
        url: Article URL
        
    Yields:
        str: Server-Sent Events formatted strings
    """
    start_time = time.time()
    
    try:
        # Send analysis start event
        start_event = AnalysisStart(
            article_url=url,
            estimated_duration=len(issues) * 2,  # Estimate 2 seconds per issue
            message="Starting analysis..."
        )
        yield f"data: {json.dumps(start_event.model_dump(mode='json'))}\n\n"
        
        # Send initial progress
        progress_event = AnalysisProgress(
            progress_percentage=0.1,
            current_step="Analyzing article content",
            message="Looking for potential issues..."
        )
        yield f"data: {json.dumps(progress_event.model_dump(mode='json'))}\n\n"
        
        await asyncio.sleep(1)  # Initial delay
        
        total_issues = len(issues)
        
        if total_issues == 0:
            progress_event = AnalysisProgress(
                progress_percentage=0.9,
                current_step="Analysis complete",
                message="No issues found in this article"
            )
            yield f"data: {json.dumps(progress_event.model_dump(mode='json'))}\n\n"
        else:
            # Stream each issue individually
            for i, issue in enumerate(issues):
                # Send progress update
                progress_pct = 0.2 + (0.7 * (i / total_issues))  # Progress from 20% to 90%
                progress_event = AnalysisProgress(
                    progress_percentage=progress_pct,
                    current_step=f"Found issue {i + 1} of {total_issues}",
                    message=f"Analyzing: {issue.text[:30]}..."
                )
                yield f"data: {json.dumps(progress_event.model_dump(mode='json'))}\n\n"
                
                await asyncio.sleep(0.5)  # Delay before sending issue
                
                # Send the issue
                streamed_issue = StreamedIssue(
                    issue=issue,
                    issue_index=i,
                    message=f"Issue {i + 1} identified"
                )
                yield f"data: {json.dumps(streamed_issue.model_dump(mode='json'))}\n\n"
                
                # Add delay between issues
                await asyncio.sleep(1.5)
        
        # Send completion event
        elapsed_time = time.time() - start_time
        complete_event = AnalysisComplete(
            total_issues=total_issues,
            analysis_duration=elapsed_time,
            message=f"Analysis complete! Found {total_issues} issues"
        )
        yield f"data: {json.dumps(complete_event.model_dump(mode='json'))}\n\n"
        
        analysis_logger.info(f"Simulated streaming analysis completed for {url}")
        
    except Exception as e:
        analysis_logger.error(f"Simulated streaming analysis failed for {url}: {e}")
        # Send error event
        error_event = AnalysisError(
            error_code="SIMULATION_FAILED",
            error_details=str(e),
            message="Analysis simulation failed"
        )
        yield f"data: {json.dumps(error_event.model_dump(mode='json'))}\n\n" 