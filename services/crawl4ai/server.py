"""
FILE PURPOSE: Crawl4AI web scraping microservice
WHY: Replaces Firecrawl ($16/mo) with open-source Crawl4AI for URL-to-markdown conversion.
     Called by the Node.js WebIngester adapter via REST.
HOW: FastAPI app with POST /scrape and GET /health endpoints.
     Uses AsyncWebCrawler with headless Chromium for JS-rendered pages.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, HttpUrl
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Crawl4AI Scraper", version="1.0.0")


class ScrapeRequest(BaseModel):
    url: HttpUrl


class ScrapeResponse(BaseModel):
    success: bool
    markdown: str
    metadata: dict[str, Any]


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/scrape", response_model=ScrapeResponse)
async def scrape(req: ScrapeRequest) -> ScrapeResponse:
    url = str(req.url)
    logger.info("Scraping %s", url)

    browser_config = BrowserConfig(headless=True)
    crawler_config = CrawlerRunConfig()

    try:
        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=url, config=crawler_config)

        if not result.success:
            logger.warning("Crawl4AI failed for %s: %s", url, result.error_message)
            return ScrapeResponse(
                success=False,
                markdown="",
                metadata={"url": url, "error": result.error_message},
            )

        return ScrapeResponse(
            success=True,
            markdown=result.markdown_v2.raw_markdown if result.markdown_v2 else result.markdown,
            metadata={
                "url": url,
                "title": getattr(result, "title", None),
                "statusCode": result.status_code,
            },
        )
    except Exception as exc:
        logger.exception("Scrape error for %s", url)
        return ScrapeResponse(
            success=False,
            markdown="",
            metadata={"url": url, "error": str(exc)},
        )
