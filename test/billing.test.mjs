import test from "node:test";
import assert from "node:assert/strict";

import {
  BillingAction,
  CreditAmount,
  PricingPolicy,
  UserWallet
} from "../src/domain/billing.mjs";

test("UserWallet starts with the configured signup credit", () => {
  const wallet = UserWallet.createForSignup(new CreditAmount(5));

  assert.equal(wallet.balance.value, 5);
});

test("PricingPolicy charges by generation mode and image count", () => {
  const policy = new PricingPolicy({
    textToImageUnitCost: new CreditAmount(1),
    imageEditUnitCost: new CreditAmount(1.5)
  });

  const textCost = policy.calculateCost(BillingAction.TextToImage, 4);
  const editCost = policy.calculateCost(BillingAction.ImageEdit, 2);

  assert.equal(textCost.value, 4);
  assert.equal(editCost.value, 3);
});

test("UserWallet rejects spending when credit is insufficient", () => {
  const wallet = new UserWallet(new CreditAmount(2));

  assert.throws(
    () => wallet.spend(new CreditAmount(3)),
    /余额不足/
  );
});
