export const BillingAction = Object.freeze({
  TextToImage: "text-to-image",
  ImageEdit: "image-edit"
});

export const WalletTransactionType = Object.freeze({
  SignupGift: "signup_gift",
  GenerationCharge: "generation_charge",
  RechargeRequest: "recharge_request",
  RechargeCredit: "recharge_credit",
  Refund: "refund"
});

// 金额值对象，统一用美元数值表达额度
export class CreditAmount {
  constructor(value) {
    this.value = this.#normalize(value);
  }

  // 将数据库金额转换为额度对象
  static fromCents(cents) {
    return new CreditAmount(Number(cents ?? 0) / 100);
  }

  // 把额度转换为整数分，避免浮点数直接入库
  toCents() {
    return Math.round(this.value * 100);
  }

  // 金额相加，返回新的不可变金额对象
  add(other) {
    return new CreditAmount(this.value + other.value);
  }

  // 金额相减，余额不足时直接拒绝
  subtract(other) {
    if (this.value < other.value) {
      throw new Error("余额不足，请先充值");
    }

    return new CreditAmount(this.value - other.value);
  }

  // 标准化金额输入，避免非法额度进入系统
  #normalize(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("额度金额不合法");
    }

    return Math.round(amount * 100) / 100;
  }
}

// 用户钱包对象，负责余额扣减和充值后的余额计算
export class UserWallet {
  constructor(balance) {
    this.balance = balance;
  }

  // 创建注册赠送额度钱包
  static createForSignup(signupCredit) {
    return new UserWallet(signupCredit);
  }

  // 扣减钱包额度，余额不足时抛出业务异常
  spend(cost) {
    this.balance = this.balance.subtract(cost);

    return this.balance;
  }

  // 增加钱包额度，用于人工充值或失败退款
  receive(amount) {
    this.balance = this.balance.add(amount);

    return this.balance;
  }
}

// 价格策略对象，根据生成类型和数量计算费用
export class PricingPolicy {
  constructor(input) {
    this.textToImageUnitCost = input.textToImageUnitCost;
    this.imageEditUnitCost = input.imageEditUnitCost;
  }

  // 计算一次生成请求需要消耗的额度
  calculateCost(action, quantity) {
    const unitCost = this.#resolveUnitCost(action);
    const imageCount = this.#normalizeQuantity(quantity);

    return new CreditAmount(unitCost.value * imageCount);
  }

  // 根据行为类型选择单价
  #resolveUnitCost(action) {
    if (action === BillingAction.ImageEdit) {
      return this.imageEditUnitCost;
    }

    return this.textToImageUnitCost;
  }

  // 校验生成数量，防止异常扣费和滥用请求
  #normalizeQuantity(quantity) {
    const count = Number(quantity);

    if (!Number.isInteger(count) || count < 1 || count > 4) {
      throw new Error("生成数量必须在 1 到 4 之间");
    }

    return count;
  }
}
