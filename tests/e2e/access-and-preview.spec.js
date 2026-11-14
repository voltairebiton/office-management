import { expect, test } from "@playwright/test";

test("C00-AC3 public preview shows fictional data and planned features clearly", async ({ page }) => {
  await page.goto("/preview");
  await expect(page.getByText("Fictional sample data. Changes are not saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();
  await expect(page.getByText("Operations room", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Refreshments/ })).toContainText("Later");
  await expect(page.getByText("Room assignments · not attendance")).toBeVisible();
});

test("C00-AC3 anonymous staff requests reach setup when WorkOS is not configured", async ({ page }) => {
  await page.goto("/dashboard?view=offices");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("heading", { name: /connect your workspace/i })).toBeVisible();
});

test("sign-in cannot skip configuration and create an unverified staff session", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("heading", { name: /connect your workspace/i })).toBeVisible();
});

test("preview office filter consistently scopes office counts and shortage rows", async ({ page }) => {
  await page.goto("/preview");
  await page.getByLabel("Filter by office").selectOption("north");
  await expect(page.getByRole("main").locator(".ws-context")).toContainText("North Office");
  await expect(page.getByRole("main").locator(".ws-office-list").getByText("Central Office", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Reception", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").locator(".ws-table").getByText("Operations room", { exact: true })).toHaveCount(0);
  await expect(page.getByText("26", { exact: true })).toBeVisible();
});

test("mobile navigation opens, follows a link, and supports keyboard dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview");
  const openNavigation = page.getByRole("button", { name: "Open navigation" });
  await expect(openNavigation).toBeVisible();
  await openNavigation.click();
  const mobileNavigation = page.getByRole("navigation", { name: "Mobile workspace navigation" });
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole("link", { name: "Catalog & stock" }).click();
  await expect(page).toHaveURL(/view=inventory/);
  await expect(page.getByRole("heading", { name: "Supplies & furniture" })).toBeVisible();
  await openNavigation.click();
  await page.keyboard.press("Escape");
  await expect(mobileNavigation).toBeHidden();
  await expect(openNavigation).toBeFocused();
});
