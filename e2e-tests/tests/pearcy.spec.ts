import { expect, test } from "@playwright/test";

const AVATAR = "Chat with Pearcy, the shopping assistant";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    // Use the deterministic local engine by default so tests don't hit the
    // real Mistral backend. Real-backend tests below opt out and stub /api/chat.
    localStorage.setItem("pearcy:mock", "1");
  });
});

test("Pearcy avatar is present on every storefront page", async ({ page }) => {
  const pages = [
    "/",
    "/product-apple.html",
    "/product-banana.html",
    "/product-lemon.html",
    "/basket.html",
    "/checkout.html",
  ];

  for (const path of pages) {
    await test.step(`Given the shopper opens ${path}`, async () => {
      await page.goto(path);
    });
    await test.step("Then Pearcy is waiting in the corner", async () => {
      await expect(page.getByRole("button", { name: AVATAR })).toBeVisible();
    });
  }
});

test("clicking Pearcy opens and closes the chat panel", async ({ page }) => {
  await test.step("Given the shopper is on the homepage", async () => {
    await page.goto("/");
  });

  await test.step("When the shopper clicks Pearcy", async () => {
    await page.getByRole("button", { name: AVATAR }).click();
  });

  await test.step("Then the chat panel opens", async () => {
    await expect(page.getByRole("dialog", { name: "Chat with Pearcy" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Type your message to Pearcy" })).toBeFocused();
  });

  await test.step("When the shopper closes the chat", async () => {
    await page.getByRole("button", { name: "Close chat" }).click();
  });

  await test.step("Then the chat panel is hidden", async () => {
    await expect(page.getByRole("dialog", { name: "Chat with Pearcy" })).toBeHidden();
  });
});

test("Escape closes the chat panel", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: AVATAR }).click();
  await expect(page.getByRole("dialog", { name: "Chat with Pearcy" })).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", { name: "Chat with Pearcy" })).toBeHidden();
});

test("Pearcy answers a product question with a recommendation", async ({ page }) => {
  await test.step("Given the chat is open", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: AVATAR }).click();
  });

  await test.step("When the shopper asks for a recommendation", async () => {
    await page.getByRole("textbox", { name: "Type your message to Pearcy" }).fill("What do you recommend?");
    await page.getByRole("button", { name: "Send message" }).click();
  });

  await test.step("Then a typing indicator shows while Pearcy thinks", async () => {
    await expect(page.getByLabel("Pearcy is typing")).toBeVisible();
  });

  await test.step("Then Pearcy replies with picks from the catalog", async () => {
    const log = page.getByRole("log", { name: "Conversation with Pearcy" });
    await expect(log).toContainText("pear-sonal picks", { timeout: 5000 });
    await expect(log.getByRole("link", { name: /Apple/ })).toBeVisible();
  });
});

test("Pearcy remembers the conversation across page navigation", async ({ page }) => {
  await test.step("Given the shopper chatted with Pearcy", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: AVATAR }).click();
    await page.getByRole("textbox", { name: "Type your message to Pearcy" }).fill("Tell me about the lemon");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page.getByRole("log", { name: "Conversation with Pearcy" })
    ).toContainText("Lemon", { timeout: 5000 });
  });

  await test.step("When the shopper navigates to another page and reopens the chat", async () => {
    await page.goto("/basket.html");
    await page.getByRole("button", { name: AVATAR }).click();
  });

  await test.step("Then the earlier messages are still there", async () => {
    const log = page.getByRole("log", { name: "Conversation with Pearcy" });
    await expect(log).toContainText("Tell me about the lemon");
    await expect(log).toContainText("Lemon");
  });
});

test("Pearcy shows a graceful fallback when the backend is unavailable", async ({ page }) => {
  await test.step("Given the AI backend is unavailable", async () => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("pearcy:offline", "1"));
    await page.getByRole("button", { name: AVATAR }).click();
  });

  await test.step("When the shopper sends a message", async () => {
    await page.getByRole("textbox", { name: "Type your message to Pearcy" }).fill("Hello?");
    await page.getByRole("button", { name: "Send message" }).click();
  });

  await test.step("Then a friendly fallback message is shown", async () => {
    await expect(
      page.getByRole("log", { name: "Conversation with Pearcy" })
    ).toContainText("offline", { timeout: 5000 });
  });
});

test("proactive tip can be dismissed and opted out of", async ({ page }) => {
  await test.step("Given proactive tips appear quickly", async () => {
    await page.addInitScript(() => {
      (window as unknown as { PEARCY_TIP_DELAY_MS: number }).PEARCY_TIP_DELAY_MS = 200;
    });
    await page.goto("/");
  });

  await test.step("Then a proactive tip appears", async () => {
    await expect(page.getByRole("status")).toBeVisible();
  });

  await test.step("When the shopper chooses 'Don't show again' and reloads", async () => {
    await page.getByRole("button", { name: "Don't show again" }).click();
    await expect(page.getByRole("status")).toBeHidden();
    await page.reload();
  });

  await test.step("Then no tip appears again", async () => {
    // Wait past the (short) tip delay to be sure it stays hidden.
    await page.waitForTimeout(500);
    await expect(page.getByRole("status")).toBeHidden();
  });
});

test("Pearcy adds an item to the basket on request", async ({ page }) => {
  await test.step("Given the chat is open with an empty basket", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: AVATAR }).click();
  });

  await test.step("When the shopper asks Pearcy to add an apple", async () => {
    await page.getByRole("textbox", { name: "Type your message to Pearcy" }).fill("Please add an apple");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page.getByRole("log", { name: "Conversation with Pearcy" })
    ).toContainText("added", { timeout: 5000 });
  });

  await test.step("Then the apple is in the basket", async () => {
    await page.goto("/basket.html");
    await expect(page.getByRole("list", { name: "Shopping basket items" })).toContainText("Apple");
  });
});

test("Pearcy adds several of an item at once", async ({ page }) => {
  await test.step("Given the chat is open", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: AVATAR }).click();
  });

  await test.step("When the shopper asks for two lemons", async () => {
    await page.getByRole("textbox", { name: "Type your message to Pearcy" }).fill("add two lemons");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page.getByRole("log", { name: "Conversation with Pearcy" })
    ).toContainText("×2", { timeout: 5000 });
  });

  await test.step("Then two lemons are in the basket", async () => {
    await page.goto("/basket.html");
    const items = page.getByRole("list", { name: "Shopping basket items" }).getByRole("listitem");
    await expect(items.filter({ hasText: "Lemon" })).toHaveCount(2);
  });
});

test("Pearcy removes an item from the basket on request", async ({ page }) => {
  await test.step("Given the shopper already has an apple in the basket", async () => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("basket", JSON.stringify(["apple"])));
    await page.getByRole("button", { name: AVATAR }).click();
  });

  await test.step("When the shopper asks Pearcy to remove the apple", async () => {
    await page.getByRole("textbox", { name: "Type your message to Pearcy" }).fill("remove the apple");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page.getByRole("log", { name: "Conversation with Pearcy" })
    ).toContainText("taken", { timeout: 5000 });
  });

  await test.step("Then the basket is empty", async () => {
    await page.goto("/basket.html");
    await expect(page.getByRole("list", { name: "Shopping basket items" })).toHaveText(
      "No products in basket."
    );
  });
});

test("Pearcy declines to remove an item that isn't in the basket", async ({ page }) => {
  await test.step("Given the chat is open with an empty basket", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: AVATAR }).click();
  });

  await test.step("When the shopper asks to remove a banana that isn't there", async () => {
    await page.getByRole("textbox", { name: "Type your message to Pearcy" }).fill("remove the banana");
    await page.getByRole("button", { name: "Send message" }).click();
  });

  await test.step("Then Pearcy says there's nothing to remove", async () => {
    await expect(
      page.getByRole("log", { name: "Conversation with Pearcy" })
    ).toContainText("don't see any", { timeout: 5000 });
  });
});

test("Pearcy returns a real reply from the Mistral-backed endpoint", async ({ page }) => {
  let requestBody: { message?: string; basket?: string[] } = {};

  await test.step("Given the real backend is used and stubbed", async () => {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("pearcy:mock"));
    await page.route("**/api/chat", async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reply: "My favourite is the zesty lemon! 🍋🍐", basket: [] }),
      });
    });
    await page.getByRole("button", { name: AVATAR }).click();
  });

  await test.step("When the shopper asks an open-ended question", async () => {
    await page.getByRole("textbox", { name: "Type your message to Pearcy" }).fill("What's your favourite fruit?");
    await page.getByRole("button", { name: "Send message" }).click();
  });

  await test.step("Then the backend reply is shown and the message was sent to /api/chat", async () => {
    await expect(
      page.getByRole("log", { name: "Conversation with Pearcy" })
    ).toContainText("zesty lemon", { timeout: 5000 });
    expect(requestBody.message).toBe("What's your favourite fruit?");
  });
});

test("Pearcy syncs the basket returned by the backend tool loop", async ({ page }) => {
  await test.step("Given the backend responds with a basket change", async () => {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("pearcy:mock"));
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reply: "Popped an apple in for you! 🍏🍐", basket: ["apple"] }),
      });
    });
    await page.getByRole("button", { name: AVATAR }).click();
  });

  await test.step("When the shopper asks Pearcy to add an apple", async () => {
    await page.getByRole("textbox", { name: "Type your message to Pearcy" }).fill("add an apple");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page.getByRole("log", { name: "Conversation with Pearcy" })
    ).toContainText("Popped an apple", { timeout: 5000 });
  });

  await test.step("Then the basket reflects the backend's result", async () => {
    await page.goto("/basket.html");
    await expect(page.getByRole("list", { name: "Shopping basket items" })).toContainText("Apple");
  });
});

test("Pearcy shows the fallback when the real backend errors", async ({ page }) => {
  await test.step("Given the backend returns an error", async () => {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("pearcy:mock"));
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "upstream" }) });
    });
    await page.getByRole("button", { name: AVATAR }).click();
  });

  await test.step("When the shopper sends a message", async () => {
    await page.getByRole("textbox", { name: "Type your message to Pearcy" }).fill("hello there");
    await page.getByRole("button", { name: "Send message" }).click();
  });

  await test.step("Then a friendly fallback message is shown", async () => {
    await expect(
      page.getByRole("log", { name: "Conversation with Pearcy" })
    ).toContainText("offline", { timeout: 5000 });
  });
});

test("Pearcy checks the shopper out through the chat", async ({ page }) => {
  const input = () => page.getByRole("textbox", { name: "Type your message to Pearcy" });
  const send = () => page.getByRole("button", { name: "Send message" });
  const log = page.getByRole("log", { name: "Conversation with Pearcy" });

  await test.step("Given the shopper has an item in the basket", async () => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("basket", JSON.stringify(["apple"])));
    await page.getByRole("button", { name: AVATAR }).click();
  });

  await test.step("When the shopper asks to check out, Pearcy asks for a name", async () => {
    await input().fill("I'd like to checkout");
    await send().click();
    await expect(log).toContainText("what name", { timeout: 5000 });
  });

  await test.step("When the shopper gives a name, Pearcy asks for an address", async () => {
    await input().fill("Jamie");
    await send().click();
    await expect(log).toContainText("delivery address", { timeout: 5000 });
  });

  await test.step("When the shopper gives an address, Pearcy places the order", async () => {
    await input().fill("10 Downing Street");
    await send().click();
    await expect(log).toContainText("Order placed", { timeout: 5000 });
  });

  await test.step("Then the basket has been emptied", async () => {
    await page.goto("/basket.html");
    await expect(page.getByRole("list", { name: "Shopping basket items" })).toHaveText(
      "No products in basket."
    );
  });
});

test("Pearcy won't check out an empty basket", async ({ page }) => {
  await test.step("Given the chat is open with an empty basket", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: AVATAR }).click();
  });

  await test.step("When the shopper tries to check out", async () => {
    await page.getByRole("textbox", { name: "Type your message to Pearcy" }).fill("checkout please");
    await page.getByRole("button", { name: "Send message" }).click();
  });

  await test.step("Then Pearcy says the basket is empty", async () => {
    await expect(
      page.getByRole("log", { name: "Conversation with Pearcy" })
    ).toContainText("empty", { timeout: 5000 });
  });
});

test("Pearcy places an order via the backend and clears the basket", async ({ page }) => {
  await test.step("Given the real backend confirms an order", async () => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("pearcy:mock");
      localStorage.setItem("basket", JSON.stringify(["apple", "lemon"]));
    });
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reply: "Order placed — thank you, Jamie! 🎉🍐", basket: [], order: true }),
      });
    });
    await page.getByRole("button", { name: AVATAR }).click();
  });

  await test.step("When the shopper checks out", async () => {
    await page
      .getByRole("textbox", { name: "Type your message to Pearcy" })
      .fill("check me out, I'm Jamie at 10 Downing Street");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page.getByRole("log", { name: "Conversation with Pearcy" })
    ).toContainText("Order placed", { timeout: 5000 });
  });

  await test.step("Then the basket returned by the backend (empty) is synced", async () => {
    await page.goto("/basket.html");
    await expect(page.getByRole("list", { name: "Shopping basket items" })).toHaveText(
      "No products in basket."
    );
  });
});

test("a shopper completes a full shopping journey with Pearcy", async ({ page }) => {
  const input = () => page.getByRole("textbox", { name: "Type your message to Pearcy" });
  const send = () => page.getByRole("button", { name: "Send message" });
  const log = page.getByRole("log", { name: "Conversation with Pearcy" });
  const say = async (message: string) => {
    await input().fill(message);
    await send().click();
  };

  await test.step("Given a first-time shopper opens the chat on the homepage", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: AVATAR }).click();
  });

  await test.step("When they ask for a recommendation, Pearcy suggests picks", async () => {
    await say("what do you recommend?");
    await expect(log).toContainText("pear-sonal picks", { timeout: 5000 });
  });

  await test.step("When they stock up on several fruits, Pearcy adds them", async () => {
    await say("add two apples");
    await expect(log).toContainText("×2", { timeout: 5000 });
    await say("add a lemon");
    await expect(log).toContainText("Lemon", { timeout: 5000 });
  });

  await test.step("When they ask what's in the basket, Pearcy lists all three items", async () => {
    await say("what's in my basket?");
    await expect(log).toContainText("3 items", { timeout: 5000 });
    await expect(log).toContainText("Apple");
    await expect(log).toContainText("Lemon");
  });

  await test.step("When they change their mind, Pearcy empties the basket", async () => {
    await say("actually, empty my basket");
    await expect(log).toContainText("squeaky-clean", { timeout: 5000 });
  });

  await test.step("Then the basket page confirms it is empty", async () => {
    await page.goto("/basket.html");
    await expect(page.getByRole("list", { name: "Shopping basket items" })).toHaveText(
      "No products in basket."
    );
  });

  await test.step("When they start fresh with a single banana", async () => {
    await page.getByRole("button", { name: AVATAR }).click();
    await say("add a banana");
    await expect(log).toContainText("added", { timeout: 5000 });
  });

  await test.step("When they check out, Pearcy collects a name and address then places the order", async () => {
    await say("checkout please");
    await expect(log).toContainText("what name", { timeout: 5000 });
    await say("Jamie");
    await expect(log).toContainText("delivery address", { timeout: 5000 });
    await say("10 Downing Street");
    await expect(log).toContainText("Order placed", { timeout: 5000 });
  });

  await test.step("Then the basket is empty again after the order", async () => {
    await page.goto("/basket.html");
    await expect(page.getByRole("list", { name: "Shopping basket items" })).toHaveText(
      "No products in basket."
    );
  });
});

test("the avatar can be dismissed and restored", async ({ page }) => {
  await test.step("Given the shopper is on the homepage", async () => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: AVATAR })).toBeVisible();
  });

  await test.step("When the shopper hides Pearcy", async () => {
    await page.getByRole("button", { name: "Hide Pearcy" }).click({ force: true });
  });

  await test.step("Then the avatar is gone and a restore control appears", async () => {
    await expect(page.getByRole("button", { name: AVATAR })).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Show Pearcy the shopping assistant" })
    ).toBeVisible();
  });

  await test.step("When the shopper restores Pearcy", async () => {
    await page.getByRole("button", { name: "Show Pearcy the shopping assistant" }).click();
  });

  await test.step("Then the avatar is back", async () => {
    await expect(page.getByRole("button", { name: AVATAR })).toBeVisible();
  });
});
