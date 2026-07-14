// Unit tests for the basket tool logic in api/chat.js. Run with: npm run test:unit
const test = require("node:test");
const assert = require("node:assert");
const { applyTool } = require("./chat.js");

const add = (product, quantity) => ({
  function: { name: "add_to_basket", arguments: JSON.stringify({ product, quantity }) },
});
const remove = (product, quantity) => ({
  function: { name: "remove_from_basket", arguments: JSON.stringify({ product, quantity }) },
});

test("repeated adds keep growing the basket", () => {
  let basket = [];
  basket = applyTool(add("apple", 2), basket).basket;
  basket = applyTool(add("apple", 2), basket).basket;
  assert.deepStrictEqual(basket, ["apple", "apple", "apple", "apple"]);
});

test("add tolerates plural and capitalised product names", () => {
  let basket = [];
  const r1 = applyTool(add("apples", 2), basket);
  assert.strictEqual(r1.payload.ok, true);
  basket = r1.basket;
  const r2 = applyTool(add("Apple", 1), basket);
  assert.strictEqual(r2.payload.ok, true);
  basket = r2.basket;
  assert.deepStrictEqual(basket, ["apple", "apple", "apple"]);
});

test("adding an unknown product reports ok:false and does not change the basket", () => {
  const r = applyTool(add("mango", 1), ["apple"]);
  assert.strictEqual(r.payload.ok, false);
  assert.deepStrictEqual(r.basket, ["apple"]);
});

test("removing an item that isn't present reports ok:false", () => {
  const r = applyTool(remove("banana", 1), ["apple"]);
  assert.strictEqual(r.payload.ok, false);
  assert.deepStrictEqual(r.basket, ["apple"]);
});

test("removing reports how many were actually removed", () => {
  const r = applyTool(remove("apple", 5), ["apple", "apple"]);
  assert.strictEqual(r.payload.ok, true);
  assert.deepStrictEqual(r.basket, []);
});
