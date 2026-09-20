import assert from "assert";

const RATE = 0.00003;
const MIN_SOL = 1;

function reflection(sol: number): number {
  return sol >= MIN_SOL ? sol * RATE : 0;
}

describe("Allen reflection economics", () => {
  it("rejects buys below 1 SOL", () => {
    assert.strictEqual(reflection(0.999), 0);
  });

  it("qualifies exactly 1 SOL", () => {
    assert.strictEqual(reflection(1), 0.00003);
  });

  it("calculates 2 SOL correctly", () => {
    assert.strictEqual(reflection(2), 0.00006);
  });

  it("calculates 10 SOL correctly", () => {
    assert.strictEqual(reflection(10), 0.0003);
  });

  it("calculates 100 SOL correctly", () => {
    assert.strictEqual(reflection(100), 0.003);
  });
});
