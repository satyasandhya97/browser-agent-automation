import "dotenv/config";
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import { chromium } from "playwright";

let browser;
let page;


const openBrowser = tool({
    name: "open_browser",
    description: "Launches Google Chrome browser and opens a blank page",
    parameters: z.object({}),
    async execute() {
        if (!browser) {
            browser = await chromium.launch({
                headless: false,
                channel: "chrome",
            });
            page = await browser.newPage();
        }
        return { success: true, message: "Chrome launched successfully" };
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
        await Promise.all([
            page.waitForLoadState("domcontentloaded"),
            el.click(),
        ]);
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
            await element.fill(text);

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
    instructions: `
        You are an automation agent performing signup on ChaiCode UI Vault.

        ✅ Use these updated selectors (based on actual HTML):
        - First Name: #firstName
        - Last Name: #lastName
        - Email: input[type="email"]
        - Password: #password
        - Confirm Password: #confirmPassword
        - Submit Button: button:has-text("Create Account")

        🚀 Steps:
        1. Open browser and navigate to https://ui.chaicode.com
        2. Take initial screenshot
        3. Click "Sign Up" in sidebar → selector: text="Sign Up"
        4. Wait until form is visible: input[type="email"]
        5. Fill the form:
        - First Name: Sinu
        - Last Name: Biswal
        - Email: satyasandhyabiswal97@gmail.com
        - Password: 123456
        - Confirm Password: 123456
        6. Verify each field is filled correctly
        7. Take screenshot after filling form
        8. Click "Create Account" button
        9. Take final screenshot after submission

    `,
    maxTurns: 40,
    tools: [openBrowser, openURL, clickSelector, fillInput, takeScreenShot],
});


(async () => {
    try {
        const result = await run(
            websiteAutomationAgent,
            `Automate Sign Up on https://ui.chaicode.com with:
             First Name: Sinu
             Last Name: Biswal
             Email: satyasandhyabiswal97@gmail.com
             Password: 123456
             Confirm Password: 123456
             `,
            { maxTurns: 40 },
        );
        console.log("Final Result:", result?.output ?? result);
    } catch (err) {
        console.error("Agent run failed:", err);
    } finally {
        if (browser) await browser.close();
    }
})();
