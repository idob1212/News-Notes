import re
from typing import List, Optional
from datetime import datetime
from pymongo import MongoClient

from langchain_perplexity import ChatPerplexity
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser

from config import settings
from logger import db_logger, analysis_logger
from models import Issue, AnalysisOutput, ArticleAnalysisDocument


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

IMPORTANT INSTRUCTIONS:
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

For each identified issue or valuable context, provide:
1. The exact text segment from the article that this relates to (or "GENERAL CONTEXT" if it applies to the entire article). Call this field 'text'.
2. A concise explanation of either:
   - Why this segment is problematic and what your web search revealed (for factual issues)
   - What valuable supplementary information or context this provides to enhance understanding (for helpful context)
   Call this field 'explanation'.
3. A list of URLs to credible sources that either contradict/clarify the claim or provide the supplementary information. Call this field 'source_urls'.
4. A confidence score (0.0-1.0) for your assessment based on the quality and consistency of sources found. Call this field 'confidence_score'.

Current Date: {current_date}
Article Title: {article_title}
Article URL: {article_url}

FULL ARTICLE TO ANALYZE:
{article_content}

{format_instructions}

Perform comprehensive web searches as needed to verify claims throughout this article and find relevant supplementary information. Ensure your entire response is a single JSON object matching the Pydantic schema provided in the format instructions.
Include both factual corrections and valuable contextual information that would help readers better understand the subject matter.
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
    output_parser = PydanticOutputParser(pydantic_object=AnalysisOutput)
    chain = prompt | llm | output_parser
    
    result = chain.invoke({
        "current_date": datetime.now().strftime("%Y-%m-%d"),
        "article_title": title,
        "article_url": url,
        "article_content": content
    })
    
    return result 