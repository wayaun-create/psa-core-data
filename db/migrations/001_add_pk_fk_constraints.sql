BEGIN;

-- Optional data cleanup from known orphan values in this dataset.
UPDATE tax_sales
SET client_id = NULL
WHERE client_id = 'TH101';

UPDATE parcels
SET tax_sale_id = NULL
WHERE tax_sale_id IN ('1', '99');

-- Add primary keys only if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pk_accounts'
      AND contype = 'p'
  ) THEN
    ALTER TABLE accounts
    ADD CONSTRAINT pk_accounts PRIMARY KEY (acct_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pk_clients'
      AND contype = 'p'
  ) THEN
    ALTER TABLE clients
    ADD CONSTRAINT pk_clients PRIMARY KEY (client_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pk_tax_sales'
      AND contype = 'p'
  ) THEN
    ALTER TABLE tax_sales
    ADD CONSTRAINT pk_tax_sales PRIMARY KEY (tax_sale_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pk_parcels'
      AND contype = 'p'
  ) THEN
    ALTER TABLE parcels
    ADD CONSTRAINT pk_parcels PRIMARY KEY (parcel_id);
  END IF;
END $$;

-- Add foreign keys only if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_clients_accounts'
      AND contype = 'f'
  ) THEN
    ALTER TABLE clients
    ADD CONSTRAINT fk_clients_accounts
    FOREIGN KEY (acct_id) REFERENCES accounts(acct_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_tax_sales_clients'
      AND contype = 'f'
  ) THEN
    ALTER TABLE tax_sales
    ADD CONSTRAINT fk_tax_sales_clients
    FOREIGN KEY (client_id) REFERENCES clients(client_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_parcels_tax_sales'
      AND contype = 'f'
  ) THEN
    ALTER TABLE parcels
    ADD CONSTRAINT fk_parcels_tax_sales
    FOREIGN KEY (tax_sale_id) REFERENCES tax_sales(tax_sale_id);
  END IF;
END $$;

COMMIT;
