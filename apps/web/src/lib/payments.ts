// The payment gateway behind one interface. The mock accepts every charge. HitPay replaces it later
// without changing the billing rules, which run in the database.
export type ChargeRequest = { amount: number; reference: string };
export type ChargeResult = { ok: true; gatewayRef: string };

export interface PaymentGateway {
  readonly name: "mock";
  charge(request: ChargeRequest): Promise<ChargeResult>;
}

export const mockGateway: PaymentGateway = {
  name: "mock",
  async charge(request) {
    return { ok: true, gatewayRef: `MOCK-${request.reference}` };
  },
};
