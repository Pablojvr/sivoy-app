-- Additive model for public schedules and company-published delivery promises.
-- Legacy tables remain untouched until adapters and comparison tests are ready.
CREATE TABLE service_calendars (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agency_id integer NOT NULL REFERENCES agencias(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('SELLER_DROP_OFF', 'CUSTOMER_PICKUP', 'CUSTOMER_SERVICE')),
  timezone text NOT NULL DEFAULT 'America/El_Salvador',
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until >= valid_from),
  UNIQUE (agency_id, purpose, valid_from)
);

CREATE TABLE weekly_intervals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  calendar_id bigint NOT NULL REFERENCES service_calendars(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  opens_at time NOT NULL,
  closes_at time NOT NULL,
  display_order smallint NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  CHECK (closes_at > opens_at),
  UNIQUE (calendar_id, weekday, opens_at, closes_at)
);

CREATE TABLE calendar_exceptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  calendar_id bigint NOT NULL REFERENCES service_calendars(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (calendar_id, service_date)
);

CREATE TABLE calendar_exception_intervals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exception_id bigint NOT NULL REFERENCES calendar_exceptions(id) ON DELETE CASCADE,
  opens_at time NOT NULL,
  closes_at time NOT NULL,
  display_order smallint NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  CHECK (closes_at > opens_at),
  UNIQUE (exception_id, opens_at, closes_at)
);

CREATE TABLE delivery_policies (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id integer NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  origin_agency_id integer REFERENCES agencias(id) ON DELETE CASCADE,
  destination_agency_id integer REFERENCES agencias(id) ON DELETE CASCADE,
  destination_municipality text,
  priority integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(destination_agency_id, destination_municipality) = 1),
  CHECK (destination_municipality IS NULL OR btrim(destination_municipality) <> '')
);

CREATE TABLE delivery_policy_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  policy_id bigint NOT NULL REFERENCES delivery_policies(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  policy_type text NOT NULL CHECK (policy_type IN
    ('FIXED_LEAD_DAYS', 'SAME_DAY', 'NEXT_WEEKDAY', 'WEEKDAY_IN_FOLLOWING_WEEK')),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  valid_from date NOT NULL,
  valid_until date,
  source_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until >= valid_from),
  UNIQUE (policy_id, version)
);

CREATE TABLE delivery_policy_exceptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  policy_version_id bigint NOT NULL REFERENCES delivery_policy_versions(id) ON DELETE CASCADE,
  submitted_on date NOT NULL,
  available_on date,
  unavailable boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((unavailable AND available_on IS NULL) OR (NOT unavailable AND available_on IS NOT NULL)),
  UNIQUE (policy_version_id, submitted_on)
);

CREATE INDEX service_calendars_agency_purpose_idx ON service_calendars (agency_id, purpose, valid_from DESC);
CREATE INDEX weekly_intervals_calendar_weekday_idx ON weekly_intervals (calendar_id, weekday, opens_at);
CREATE INDEX calendar_exceptions_calendar_date_idx ON calendar_exceptions (calendar_id, service_date);
CREATE INDEX calendar_exception_intervals_exception_idx
  ON calendar_exception_intervals (exception_id, opens_at);
CREATE INDEX delivery_policies_lookup_idx ON delivery_policies
  (company_id, destination_agency_id, origin_agency_id, priority DESC) WHERE active;
CREATE INDEX delivery_policies_municipality_lookup_idx ON delivery_policies
  (company_id, lower(destination_municipality), priority DESC)
  WHERE active AND destination_municipality IS NOT NULL;
CREATE UNIQUE INDEX delivery_policies_scope_uidx ON delivery_policies
  (company_id, coalesce(origin_agency_id, 0), coalesce(destination_agency_id, 0),
   coalesce(lower(destination_municipality), ''), priority);
CREATE INDEX delivery_policy_versions_effective_idx ON delivery_policy_versions
  (policy_id, valid_from DESC, valid_until);
