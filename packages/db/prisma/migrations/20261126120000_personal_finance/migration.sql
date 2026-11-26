BEGIN;

CREATE TABLE public.user_payment_methods (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "institution" TEXT,
  "accountMask" TEXT,
  "last4" TEXT,
  "holderName" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'CNY',
  "billingDay" INTEGER,
  "repaymentDay" INTEGER,
  "creditLimitCents" INTEGER,
  "balanceCents" INTEGER,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "accentColor" TEXT,
  "secretCiphertext" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_payment_methods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_payment_methods_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES public."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "user_payment_methods_userId_isDefault_updatedAt_idx"
  ON public.user_payment_methods ("userId", "isDefault", "updatedAt");

ALTER TABLE public.user_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_payment_methods_tenant ON public.user_payment_methods
  USING ("userId" = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK ("userId" = NULLIF(current_setting('app.user_id', true), ''));

CREATE POLICY user_payment_methods_system ON public.user_payment_methods
  USING ((SELECT app_rls_bypass()))
  WITH CHECK ((SELECT app_rls_bypass()));

CREATE TABLE public.user_finance_bills (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CNY',
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "paymentMethodId" TEXT,
  "paymentMethodLabel" TEXT,
  "status" TEXT NOT NULL DEFAULT 'paid',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_finance_bills_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_finance_bills_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES public."user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_finance_bills_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId")
    REFERENCES public.user_payment_methods("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "user_finance_bills_userId_occurredAt_idx"
  ON public.user_finance_bills ("userId", "occurredAt");

CREATE INDEX "user_finance_bills_userId_paymentMethodId_idx"
  ON public.user_finance_bills ("userId", "paymentMethodId");

ALTER TABLE public.user_finance_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_finance_bills_tenant ON public.user_finance_bills
  USING ("userId" = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK ("userId" = NULLIF(current_setting('app.user_id', true), ''));

CREATE POLICY user_finance_bills_system ON public.user_finance_bills
  USING ((SELECT app_rls_bypass()))
  WITH CHECK ((SELECT app_rls_bypass()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rakazo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_payment_methods TO rakazo_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_finance_bills TO rakazo_app;
  END IF;
END $$;

COMMIT;
