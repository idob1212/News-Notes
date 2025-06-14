"""
Logging configuration for the News Fact-Checker API.
"""
import logging
import sys
from typing import Optional


class Logger:
    """Custom logger for the application."""
    
    def __init__(self, name: str, level: str = "INFO"):
        """
        Initialize logger with specified name and level.
        
        Args:
            name: Logger name
            level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        """
        self.logger = logging.getLogger(name)
        self.logger.setLevel(getattr(logging, level.upper()))
        
        # Avoid adding handlers multiple times
        if not self.logger.handlers:
            # Create console handler
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setLevel(getattr(logging, level.upper()))
            
            # Create formatter
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            console_handler.setFormatter(formatter)
            
            # Add handler to logger
            self.logger.addHandler(console_handler)
    
    def debug(self, message: str, **kwargs):
        """Log debug message."""
        self.logger.debug(message, extra=kwargs)
    
    def info(self, message: str, **kwargs):
        """Log info message."""
        self.logger.info(message, extra=kwargs)
    
    def warning(self, message: str, **kwargs):
        """Log warning message."""
        self.logger.warning(message, extra=kwargs)
    
    def error(self, message: str, error: Optional[Exception] = None, **kwargs):
        """Log error message with optional exception."""
        if error:
            self.logger.error(f"{message}: {str(error)}", extra=kwargs, exc_info=True)
        else:
            self.logger.error(message, extra=kwargs)
    
    def critical(self, message: str, error: Optional[Exception] = None, **kwargs):
        """Log critical message with optional exception."""
        if error:
            self.logger.critical(f"{message}: {str(error)}", extra=kwargs, exc_info=True)
        else:
            self.logger.critical(message, extra=kwargs)


# Create application loggers
app_logger = Logger("news_fact_checker")
analysis_logger = Logger("analysis")
db_logger = Logger("database") 