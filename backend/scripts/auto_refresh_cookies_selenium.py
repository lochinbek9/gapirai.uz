#!/usr/bin/env python3
import os
import sys
import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

YOUTUBE_EMAIL = os.getenv("YOUTUBE_EMAIL")
YOUTUBE_PASSWORD = os.getenv("YOUTUBE_PASSWORD")
COOKIES_PATH = os.getenv("YOUTUBE_COOKIES_PATH", "/app/cookies.txt")

if not YOUTUBE_EMAIL or not YOUTUBE_PASSWORD:
    print("❌ Xato: YOUTUBE_EMAIL va YOUTUBE_PASSWORD .env faylida yo'q")
    sys.exit(1)

def refresh_cookies():
    print(f"🔄 Cookie yangilanmoqda: {YOUTUBE_EMAIL}")
    
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    
    driver = None
    try:
        # Tizimdagi chromedriver dan to'g'ridan-to'g'ri foydalanamiz
        service = Service(executable_path='/usr/bin/chromedriver')
        driver = webdriver.Chrome(service=service, options=chrome_options)
        
        driver.get("https://accounts.google.com/signin")
        
        email_field = WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.CSS_SELECTOR, 'input[type="email"]')))
        email_field.clear()
        email_field.send_keys(YOUTUBE_EMAIL)
        driver.find_element(By.ID, "identifierNext").click()
        
        password_field = WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.CSS_SELECTOR, 'input[type="password"]')))
        password_field.clear()
        password_field.send_keys(YOUTUBE_PASSWORD)
        driver.find_element(By.ID, "passwordNext").click()
        
        driver.get("https://www.youtube.com")
        time.sleep(5)
        
        cookies = driver.get_cookies()
        
        with open(COOKIES_PATH, "w") as f:
            f.write("# Netscape HTTP Cookie File\n")
            for cookie in cookies:
                domain = cookie.get("domain", "")
                path = cookie.get("path", "/")
                secure = "TRUE" if cookie.get("secure") else "FALSE"
                expires = str(int(cookie.get("expiry", 0))) if cookie.get("expiry") else "0"
                name = cookie.get("name", "")
                value = cookie.get("value", "")
                include_subdomains = "TRUE" if domain.startswith(".") else "FALSE"
                f.write(f"{domain}\t{include_subdomains}\t{path}\t{secure}\t{expires}\t{name}\t{value}\n")
        
        print(f"✅ Cookie yangilandi: {COOKIES_PATH} (Jami: {len(cookies)})")
        
    except Exception as e:
        print(f"❌ Xato: {e}")
        sys.exit(1)
    finally:
        if driver:
            driver.quit()

if __name__ == "__main__":
    refresh_cookies()
