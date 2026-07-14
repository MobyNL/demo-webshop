// Pearcy's brain — a Vercel serverless function that turns shopper messages
// into real responses from Mistral AI.
//
// The API key lives only here (server-side); it never reaches the browser.
// The whole tool-calling loop runs here too: the client sends its current
// basket, Mistral decides on add/remove/clear tool calls, we apply them to the
// basket in-memory and feed the results back until the model produces a final
// reply. We return { reply, basket } and the client syncs to it.

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
const MODEL = "mistral-small-latest";
const MAX_TOOL_STEPS = 4;

const PRODUCTS = {
  apple: { name: "Apple", emoji: "🍏", desc: "crisp, classic, keeps the doctor away" },
  banana: { name: "Banana", emoji: "🍌", desc: "nature's energy bar, monkey-approved" },
  lemon: { name: "Lemon", emoji: "🍋", desc: "zesty and zingy, brightens any day" },
};

const SYSTEM_PROMPT = [
  "You are Pearcy, a cheerful, punny cartoon pear who is the shopping assistant for an online Fruit Shop.",
  "Personality: warm, helpful, never pushy. You love a good fruit pun (\"pear-fect\", \"ap-peel-ing\", \"ripe for a chat\") but use them sparingly — at most one per reply. Occasionally add a 🍐.",
  "Keep replies short: 1-3 sentences.",
  "The shop sells exactly three products: Apple 🍏 (crisp, classic), Banana 🍌 (energy boost), Lemon 🍋 (zesty). Never invent other products or prices.",
  "You can manage the shopper's basket using the provided tools (add, remove, clear). After changing the basket, confirm briefly what you did.",
  "You cannot take payment or complete checkout yourself — if asked, point the shopper to the basket page's Checkout button.",
  "If a question is off-topic, gently steer back to fruit and how you can help them shop.",
].join(" ");

const TOOLS = [
  {
    type: "function",
    function: {
      name: "add_to_basket",
      description: "Add one or more units of a product to the shopper's basket.",
      parameters: {
        type: "object",
        properties: {
          product: { type: "string", enum: ["apple", "banana", "lemon"] },
          quantity: { type: "integer", minimum: 1, maximum: 100, description: "How many to add (default 1)." },
        },
        required: ["product"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_from_basket",
      description: "Remove one or more units of a product from the shopper's basket.",
      parameters: {
        type: "object",
        properties: {
          product: { type: "string", enum: ["apple", "banana", "lemon"] },
          quantity: { type: "integer", minimum: 1, maximum: 100, description: "How many to remove (default 1)." },
        },
        required: ["product"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_basket",
      description: "Remove everything from the shopper's basket.",
      parameters: { type: "object", properties: {} },
    },
  },
];

function stripHtml(str) {
  return String(str || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clampQty(q) {
  var n = parseInt(q, 10);
  if (isNaN(n) || n < 1) return 1;
  return Math.min(100, n);
}

function describeBasket(basket) {
  if (!basket.length) return "empty";
  var counts = {};
  basket.forEach(function (p) {
    counts[p] = (counts[p] || 0) + 1;
  });
  return Object.keys(counts)
    .map(function (p) {
      var item = PRODUCTS[p];
      return counts[p] + "× " + (item ? item.name + " " + item.emoji : p);
    })
    .join(", ");
}

// Apply a single tool call to a basket, returning the new basket + a result
// payload to feed back to the model.
function applyTool(toolCall, basket) {
  var args = {};
  try {
    args = JSON.parse((toolCall.function && toolCall.function.arguments) || "{}");
  } catch (e) {
    args = {};
  }
  var name = toolCall.function && toolCall.function.name;
  var next = basket.slice();

  if (name === "add_to_basket" && PRODUCTS[args.product]) {
    var addN = clampQty(args.quantity);
    for (var i = 0; i < addN; i++) next.push(args.product);
  } else if (name === "remove_from_basket" && PRODUCTS[args.product]) {
    var removeN = clampQty(args.quantity);
    for (var j = 0; j < removeN; j++) {
      var idx = next.indexOf(args.product);
      if (idx !== -1) next.splice(idx, 1);
    }
  } else if (name === "clear_basket") {
    next = [];
  }

  return { basket: next, payload: { ok: true, basket: describeBasket(next) } };
}

async function callMistral(apiKey, messages) {
  var res = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.6,
      max_tokens: 400,
    }),
  });
  if (!res.ok) {
    var detail = await res.text().catch(function () {
      return "";
    });
    throw new Error("Mistral " + res.status + ": " + detail.slice(0, 300));
  }
  return res.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  var apiKey = process.env.MISTRAL_AI_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "MISTRAL_AI_KEY is not configured" });
    return;
  }

  var body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }
  body = body || {};

  var userMessage = String(body.message || "").trim();
  if (!userMessage) {
    res.status(400).json({ error: "Empty message" });
    return;
  }
  var history = Array.isArray(body.history) ? body.history : [];
  var basket = Array.isArray(body.basket)
    ? body.basket.filter(function (p) {
        return PRODUCTS[p];
      })
    : [];

  // Build the conversation for Mistral.
  var messages = [{ role: "system", content: SYSTEM_PROMPT }];
  history.slice(-10).forEach(function (turn) {
    var role = turn.role === "pearcy" || turn.role === "assistant" ? "assistant" : "user";
    var content = stripHtml(turn.text);
    if (content) messages.push({ role: role, content: content });
  });
  // The client's history already ends with the current message; add it only if
  // it's somehow missing (e.g. a direct API caller).
  var last = history.length ? stripHtml(history[history.length - 1].text) : "";
  if (last !== userMessage) {
    messages.push({ role: "user", content: userMessage });
  }
  messages.push({ role: "system", content: "The shopper's current basket is: " + describeBasket(basket) + "." });

  try {
    for (var step = 0; step < MAX_TOOL_STEPS; step++) {
      var data = await callMistral(apiKey, messages);
      var choice = data.choices && data.choices[0];
      var msg = choice && choice.message;
      if (!msg) throw new Error("No message in Mistral response");

      var toolCalls = msg.tool_calls || [];
      if (!toolCalls.length) {
        var reply = stripHtml(msg.content) || "Happy to help! 🍐";
        res.status(200).json({ reply: reply, basket: basket });
        return;
      }

      // Record the assistant's tool-call turn, then apply each call.
      messages.push(msg);
      for (var t = 0; t < toolCalls.length; t++) {
        var result = applyTool(toolCalls[t], basket);
        basket = result.basket;
        messages.push({
          role: "tool",
          name: toolCalls[t].function && toolCalls[t].function.name,
          tool_call_id: toolCalls[t].id,
          content: JSON.stringify(result.payload),
        });
      }
    }
    // Ran out of tool steps — return what we have.
    res.status(200).json({ reply: "There you go! Anything else? 🍐", basket: basket });
  } catch (err) {
    res.status(502).json({ error: "Upstream error", detail: String((err && err.message) || err) });
  }
};
