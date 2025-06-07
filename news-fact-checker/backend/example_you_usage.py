#!/usr/bin/env python3
"""
Example usage of the official LangChain You.com integration.
This demonstrates how to use the You class from langchain_community.llms.you
"""

import os
from dotenv import load_dotenv
from langchain_community.llms.you import You
from langchain_core.prompts import PromptTemplate

# Load environment variables
load_dotenv()

def main():
    # Check for YDC_API_KEY (official LangChain You.com key name)
    ydc_api_key = os.getenv("YDC_API_KEY")
    if not ydc_api_key:
        print("Error: YDC_API_KEY environment variable not found.")
        print("Please set your You.com API key as YDC_API_KEY in your .env file")
        print("Example: YDC_API_KEY=your_actual_api_key_here")
        return

    try:
        # Initialize You.com LLM with the official LangChain class
        # Available endpoints: "smart" (default) and "research"
        you_llm = You(
            ydc_api_key=ydc_api_key,
            endpoint="research"  # Use research endpoint for fact-checking
        )
        
        print("✅ Successfully initialized You.com LLM with official LangChain integration")
        print(f"   Endpoint: research")
        print(f"   API Key: {ydc_api_key[:8]}...")

        # Create a simple prompt for testing
        prompt_template = PromptTemplate(
            input_variables=["question"],
            template="Please analyze this question and provide a factual response: {question}"
        )

        # Test with a simple query
        test_question = "What is the capital of France?"
        
        print(f"\n🔍 Testing with question: {test_question}")
        
        # Format the prompt and invoke the LLM
        formatted_prompt = prompt_template.format(question=test_question)
        response = you_llm.invoke(formatted_prompt)
        
        print(f"\n📝 Response from You.com:")
        print(f"   {response}")
        print(f"\n✅ Test completed successfully!")

        # Demonstrate structured output attempt
        print(f"\n🧪 Testing structured JSON output...")
        
        json_prompt = """
Please analyze the following statement and respond with a JSON object:
Statement: "The capital of France is Paris."

Respond with JSON in this format:
{
    "statement": "the original statement",
    "is_factual": true/false,
    "explanation": "brief explanation"
}
"""
        
        json_response = you_llm.invoke(json_prompt)
        print(f"📝 JSON Response attempt:")
        print(f"   {json_response}")
        
        # Try to parse as JSON
        import json
        import re
        
        json_match = re.search(r'\{.*\}', json_response, re.DOTALL)
        if json_match:
            try:
                parsed_json = json.loads(json_match.group(0))
                print(f"✅ Successfully parsed JSON:")
                print(f"   {json.dumps(parsed_json, indent=2)}")
            except json.JSONDecodeError as e:
                print(f"❌ Failed to parse extracted JSON: {e}")
        else:
            print(f"❌ No JSON object found in response")

    except Exception as e:
        print(f"❌ Error using You.com LLM: {e}")
        print(f"   Make sure your YDC_API_KEY is valid and you have sufficient credits")

if __name__ == "__main__":
    main() 