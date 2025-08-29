import "dotenv/config";
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import { chromium } from "playwright";

let browser;
let page;


const openBrowser = tool({
    name: "open_browser",
    description: "Launches a Chromium browser and opens a blank page",
    parameters: z.object({}),
    async execute() {
        if (!browser) {
            browser = await chromium.launch({ headless: false });
            page = await browser.newPage();
        }
        return { success: true, message: "Browser launched successfully" };
    },
});

const openURL = tool({
    name: "open_url",
    description: "Open a webpage",
    parameters: z.object({ url: z.string() }),
    async execute({ url }) {
        if (!page) throw new Error("No page. Call open_browser first.");
        await page.goto(url, { waitUntil: "domcontentloaded" });
        return { success: true, url, title: await page.title() };
    },
});


const clickSelector = tool({
    name: "click_selector",
    description: "Click an element using CSS or text selector",
    parameters: z.object({
        selector: z.string(),
        timeoutMs: z.number().optional().default(20000),
    }),
    async execute({ selector, timeoutMs }) {
        if (!page) throw new Error("No page. Call open_browser first.");
        await page.waitForSelector(selector, { timeout: timeoutMs, state: "visible" });
        const el = page.locator(selector).first();
        await el.scrollIntoViewIfNeeded();
        await el.click();
        return { success: true, clicked: selector };
    },
});


const fillInput = tool({
    name: "fill_input",
    description: "Fill input field by selector",
    parameters: z.object({ selector: z.string(), text: z.string() }),
    async execute({ selector, text }) {
        if (!page) throw new Error("No page. Call open_browser first.");

        try {
            await page.waitForSelector(selector, { state: "visible", timeout: 10000 });
            const element = page.locator(selector).first();

            await element.scrollIntoViewIfNeeded();
            await element.click({ clickCount: 3 });
            await page.keyboard.press("Backspace");
            await page.waitForTimeout(200);

            await element.fill(text);
            await page.waitForTimeout(300);

            const actualValue = await element.inputValue();

            if (actualValue !== text) {
                throw new Error(`Validation failed: expected "${text}", but got "${actualValue}"`);
            }

            return { success: true, filled: selector, value: text, actualValue };
        } catch (error) {
            throw new Error(`Failed to fill input ${selector}: ${error.message}`);
        }
    },
});


const takeScreenShot = tool({
    name: "take_screenshot",
    description: "Take screenshot of current page",
    parameters: z.object({}),
    async execute() {
        if (!page) throw new Error("No page. Call open_browser first.");
        const path = `screenshot-${Date.now()}.png`;
        await page.screenshot({ path, fullPage: true });
        return { success: true, savedAs: path };
    },
});

const websiteAutomationAgent = new Agent({
    name: "Website Automation Agent",
    model: "gpt-4.1-mini",
    maxTurns: 40,
    instructions: `
        You are an automation agent performing signup on ChaiCode UI Vault.

        ✅ CRITICAL: Use these selectors exactly
        - First Name: input:nth-child(1)[type="text"]
        - Last Name: input:nth-child(2)[type="text"]
        - Email: input[type="email"]
        - Password: input:nth-child(1)[type="password"]
        - Confirm Password: input:nth-child(2)[type="password"]
        - Submit Button: button:has-text("Create Account")

        🚀 Steps:
        1. Open browser and navigate to https://ui.chaicode.com
        2. Take initial screenshot
        3. Click "Sign Up" in sidebar using: text="Sign Up"
        4. Fill the form:
           - First Name: Satyasandhya
           - Last Name: Biswal
           - Email: satyasandhyabiswal97@gmail.com
           - Password: sandhya1234
           - Confirm Password: sandhya1234
        5. Verify each field is filled correctly
        6. Take screenshot after filling form
        7. Click "Create Account" button
        8. Take final screenshot after submission
    `,
    tools: [openBrowser, openURL, clickSelector, fillInput, takeScreenShot],
});


(async () => {
    try {
        const result = await run(
            websiteAutomationAgent,
            `Automate Sign Up on https://ui.chaicode.com with:
             First Name: Satyasandhya
             Last Name: Biswal
             Email: satyasandhyabiswal97@gmail.com
             Password: sandhya1234
             Confirm Password: sandhya1234`
        );
        console.log("Final Result:", result?.output ?? result);
    } catch (err) {
        console.error("Agent run failed:", err);
    } finally {
        if (browser) await browser.close();
    }
})();
