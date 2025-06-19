"""
Paddle billing integration utilities.
"""
import os
import requests
from typing import Optional, Dict, Any
from models import AccountType
from pymongo.collection import Collection


class PaddleConfig:
    """Paddle configuration class."""
    
    def __init__(self):
        self.api_key = os.getenv("PADDLE_API_KEY")
        self.webhook_secret = os.getenv("PADDLE_WEBHOOK_SECRET")
        self.vendor_id = os.getenv("PADDLE_VENDOR_ID")
        self.environment = os.getenv("PADDLE_ENVIRONMENT", "sandbox")  # sandbox or production
        
        # Product IDs - these will be set up in Paddle dashboard
        self.premium_product_id = os.getenv("PADDLE_PREMIUM_PRODUCT_ID")
        self.premium_price_id = os.getenv("PADDLE_PREMIUM_PRICE_ID")
        
        # Base URLs
        if self.environment == "production":
            self.api_base_url = "https://api.paddle.com"
            self.checkout_base_url = "https://checkout.paddle.com"
        else:
            self.api_base_url = "https://sandbox-api.paddle.com"
            self.checkout_base_url = "https://sandbox-checkout.paddle.com"
    
    @property
    def headers(self):
        """Get API headers for Paddle requests."""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }


class PaddleBilling:
    """Main class for Paddle billing operations."""
    
    def __init__(self):
        self.config = PaddleConfig()
        
        # Validate configuration on initialization
        if not self.config.api_key:
            print("WARNING: PADDLE_API_KEY not set in environment variables")
        
        if self.config.environment == "sandbox":
            print("INFO: Using Paddle Sandbox environment")
        else:
            print("INFO: Using Paddle Production environment")
            
    def validate_configuration(self) -> bool:
        """Validate that all required Paddle configuration is present."""
        missing_config = []
        
        if not self.config.api_key:
            missing_config.append("PADDLE_API_KEY")
        if not self.config.webhook_secret:
            missing_config.append("PADDLE_WEBHOOK_SECRET")
        if not self.config.premium_price_id:
            missing_config.append("PADDLE_PREMIUM_PRICE_ID")
            
        if missing_config:
            print(f"Missing Paddle configuration: {', '.join(missing_config)}")
            return False
            
        return True
    
    def create_customer(self, email: str, name: Optional[str] = None) -> Optional[str]:
        """Create a customer in Paddle."""
        if not self.config.api_key:
            print("Paddle API key not configured")
            return None
        
        url = f"{self.config.api_base_url}/customers"
        
        # Format data according to Paddle API v1 spec
        data = {
            "email": email
        }
        if name:
            data["name"] = name
        
        print(f"Creating Paddle customer with data: {data}")
        print(f"Using API endpoint: {url}")
        print(f"Environment: {self.config.environment}")
        
        try:
            response = requests.post(url, json=data, headers=self.config.headers)
            print(f"Response status: {response.status_code}")
            print(f"Response headers: {dict(response.headers)}")
            
            if response.status_code == 403:
                print("403 Forbidden error - Check your Paddle API key permissions")
                print("Make sure your API key has 'customer:write' scope")
                response_text = response.text
                print(f"Response body: {response_text}")
                return None
            
            response.raise_for_status()
            customer_data = response.json()
            print(f"Customer created successfully: {customer_data}")
            return customer_data.get("data", {}).get("id")
            
        except requests.RequestException as e:
            print(f"Error creating Paddle customer: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"Response status: {e.response.status_code}")
                print(f"Response body: {e.response.text}")
            return None
    
    def create_subscription_checkout(
        self,
        customer_id: str,
        success_url: str,
        cancel_url: str
    ) -> Optional[str]:
        """Create a checkout URL for premium subscription."""
        if not all([self.config.api_key, self.config.premium_price_id]):
            print("Paddle configuration incomplete")
            return None
        
        # First try: Create a payment link with custom URLs
        checkout_url = self._create_payment_link_checkout(customer_id, success_url, cancel_url)
        if checkout_url:
            return checkout_url
        
        # Second try: Use pre-configured payment link with customer ID
        default_payment_link = os.getenv("PADDLE_DEFAULT_PAYMENT_LINK")
        if default_payment_link and not default_payment_link.startswith("https://your-paddle-payment-link-url"):
            print("Using default payment link with customer pre-fill")
            # Append customer ID to the default payment link for pre-filling
            separator = "&" if "?" in default_payment_link else "?"
            return f"{default_payment_link}{separator}customer_id={customer_id}"
        
        # Third try: Use legacy transaction API (requires default payment link to be set in Paddle dashboard)
        print("Trying legacy transaction API...")
        checkout_url = self.create_subscription_checkout_legacy(customer_id, success_url, cancel_url)
        if checkout_url:
            return checkout_url
        
        print("No payment link options available")
        print("Solutions:")
        print("1. Set up Default Payment Link in Paddle Dashboard → Checkout → Settings")
        print("2. Add a valid PADDLE_DEFAULT_PAYMENT_LINK to your .env")
        print("3. Check the Paddle setup guide for detailed instructions")
        return None
    
    def _create_payment_link_checkout(
        self,
        customer_id: str,
        success_url: str,
        cancel_url: str
    ) -> Optional[str]:
        """Try to create a payment link with custom checkout settings."""
        # This method uses Paddle's payment links API instead of transactions
        payment_links_url = f"{self.config.api_base_url}/payment-links"
        
        data = {
            "items": [
                {
                    "price_id": self.config.premium_price_id,
                    "quantity": 1
                }
            ],
            "checkout_settings": {
                "success_url": success_url,
                "cancel_url": cancel_url,
                "display_mode": "overlay",
                "theme": "light",
                "locale": "en",
                "allow_logout": False
            },
            "custom_data": {
                "customer_id": customer_id
            }
        }
        
        print(f"Creating payment link with data: {data}")
        print(f"Using API endpoint: {payment_links_url}")
        
        try:
            response = requests.post(payment_links_url, json=data, headers=self.config.headers)
            print(f"Payment link response status: {response.status_code}")
            
            if response.status_code == 404:
                print("Payment Links API not available - this might be a sandbox limitation")
                return None
            
            if not response.ok:
                print(f"Payment link error response: {response.text}")
                return None
            
            payment_link_data = response.json()
            print(f"Payment link data: {payment_link_data}")
            checkout_url = payment_link_data.get("data", {}).get("url")
            
            if checkout_url:
                # Append customer ID for pre-filling
                separator = "&" if "?" in checkout_url else "?"
                checkout_url = f"{checkout_url}{separator}customer_id={customer_id}"
            
            print(f"Payment link URL: {checkout_url}")
            return checkout_url
            
        except requests.RequestException as e:
            print(f"Error creating payment link: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"Response status: {e.response.status_code}")
                print(f"Response body: {e.response.text}")
            return None

    def create_subscription_checkout_legacy(
        self,
        customer_id: str,
        success_url: str,
        cancel_url: str
    ) -> Optional[str]:
        """Legacy method: Create a checkout URL using transactions API (requires default payment link)."""
        if not all([self.config.api_key, self.config.premium_price_id]):
            print("Paddle configuration incomplete")
            return None
        
        # Create transaction for checkout
        transaction_url = f"{self.config.api_base_url}/transactions"
        
        data = {
            "items": [
                {
                    "price_id": self.config.premium_price_id,
                    "quantity": 1
                }
            ],
            "customer_id": customer_id,
            "checkout": {
                "settings": {
                    "success_url": success_url,
                    "cancel_url": cancel_url,
                    "display_mode": "overlay",
                    "theme": "light",
                    "locale": "en"
                }
            }
        }
        
        print(f"Creating checkout with data: {data}")
        print(f"Using API endpoint: {transaction_url}")
        
        try:
            response = requests.post(transaction_url, json=data, headers=self.config.headers)
            print(f"Checkout response status: {response.status_code}")
            print(f"Checkout response headers: {dict(response.headers)}")
            
            if not response.ok:
                print(f"Checkout error response: {response.text}")
                response.raise_for_status()
            
            transaction_data = response.json()
            print(f"Transaction data: {transaction_data}")
            checkout_url = transaction_data.get("data", {}).get("checkout", {}).get("url")
            print(f"Checkout URL: {checkout_url}")
            return checkout_url
        except requests.RequestException as e:
            print(f"Error creating Paddle checkout: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"Response status: {e.response.status_code}")
                print(f"Response body: {e.response.text}")
            return None
    
    def get_subscription(self, subscription_id: str) -> Optional[Dict[str, Any]]:
        """Get subscription details from Paddle."""
        if not self.config.api_key:
            return None
        
        url = f"{self.config.api_base_url}/subscriptions/{subscription_id}"
        
        try:
            response = requests.get(url, headers=self.config.headers)
            response.raise_for_status()
            return response.json().get("data")
        except requests.RequestException as e:
            print(f"Error getting Paddle subscription: {e}")
            return None
    
    def cancel_subscription(self, subscription_id: str) -> bool:
        """Cancel a subscription in Paddle."""
        if not self.config.api_key:
            return False
        
        url = f"{self.config.api_base_url}/subscriptions/{subscription_id}/cancel"
        
        try:
            response = requests.post(url, headers=self.config.headers)
            response.raise_for_status()
            return True
        except requests.RequestException as e:
            print(f"Error cancelling Paddle subscription: {e}")
            return False
    
    def process_webhook_event(
        self,
        event_type: str,
        event_data: Dict[str, Any],
        users_collection: Collection
    ) -> bool:
        """Process incoming Paddle webhook events."""
        try:
            if event_type == "subscription.created":
                return self._handle_subscription_created(event_data, users_collection)
            elif event_type == "subscription.updated":
                return self._handle_subscription_updated(event_data, users_collection)
            elif event_type == "subscription.cancelled":
                return self._handle_subscription_cancelled(event_data, users_collection)
            elif event_type == "transaction.completed":
                return self._handle_transaction_completed(event_data, users_collection)
            else:
                print(f"Unhandled webhook event type: {event_type}")
                return True
        except Exception as e:
            print(f"Error processing webhook event: {e}")
            return False
    
    def _handle_subscription_created(
        self,
        event_data: Dict[str, Any],
        users_collection: Collection
    ) -> bool:
        """Handle subscription creation webhook."""
        customer_id = event_data.get("customer_id")
        subscription_id = event_data.get("id")
        
        if not customer_id or not subscription_id:
            return False
        
        # Update user account to premium
        result = users_collection.update_one(
            {"paddle_customer_id": customer_id},
            {
                "$set": {
                    "account_type": AccountType.PREMIUM,
                    "paddle_subscription_id": subscription_id
                }
            }
        )
        
        return result.modified_count > 0
    
    def _handle_subscription_updated(
        self,
        event_data: Dict[str, Any],
        users_collection: Collection
    ) -> bool:
        """Handle subscription update webhook."""
        subscription_id = event_data.get("id")
        status = event_data.get("status")
        
        if not subscription_id:
            return False
        
        # Update account type based on subscription status
        if status == "active":
            account_type = AccountType.PREMIUM
        else:
            account_type = AccountType.FREE
        
        result = users_collection.update_one(
            {"paddle_subscription_id": subscription_id},
            {"$set": {"account_type": account_type}}
        )
        
        return result.modified_count > 0
    
    def _handle_subscription_cancelled(
        self,
        event_data: Dict[str, Any],
        users_collection: Collection
    ) -> bool:
        """Handle subscription cancellation webhook."""
        subscription_id = event_data.get("id")
        
        if not subscription_id:
            return False
        
        # Downgrade user to free account
        result = users_collection.update_one(
            {"paddle_subscription_id": subscription_id},
            {
                "$set": {
                    "account_type": AccountType.FREE,
                    "paddle_subscription_id": None
                }
            }
        )
        
        return result.modified_count > 0
    
    def _handle_transaction_completed(
        self,
        event_data: Dict[str, Any],
        users_collection: Collection
    ) -> bool:
        """Handle completed transaction webhook."""
        # This is typically handled by subscription events,
        # but can be used for one-time payments if needed
        return True


# Global instance
paddle_billing = PaddleBilling() 