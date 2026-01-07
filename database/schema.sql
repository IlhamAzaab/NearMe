DELETE FROM admins
WHERE id = 'cb704439-6a21-42c1-94fc-6e1d19000330';
DELETE FROM users
WHERE id = 'cb704439-6a21-42c1-94fc-6e1d19000330';
DELETE FROM auth.users
WHERE id = 'cb704439-6a21-42c1-94fc-6e1d19000330';
Latitude: 8.502360, Longitude: 81.180453

create table public.users (
  id uuid not null,
  role text null,
  email text unique,
  phone text unique,
  created_at timestamp without time zone null default now(),
  constraint users_pkey primary key (id),
  constraint users_role_check check (
    (
      role = any (
        array[
          'customer'::text,
          'admin'::text,
          'driver'::text,
          'manager'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

-- Insert (service_role)
create policy "service_role insert users"
  on public.users
  for insert
  to service_role
  with check (true);

-- Delete (service_role)
create policy "service_role delete users"
  on public.users
  for delete
  to service_role
  using (true);

-- Select (optional, if you need to read users with service_role)
create policy "service_role select users"
  on public.users
  for select
  to service_role
  using (true);

create index IF not exists idx_users_role on public.users using btree (role) TABLESPACE pg_default;

CREATE INDEX idx_users_role ON users(role);

create table public.managers (
  user_id uuid not null,
  username text not null,
  email text not null,
  mobile_number text not null,
  constraint managers_pkey primary key (user_id),
  constraint managers_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;

CREATE TABLE admins (
user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
username TEXT NOT NULL,
email TEXT UNIQUE NOT NULL,
phone TEXT,
force_password_change BOOLEAN DEFAULT true,
profile_completed BOOLEAN DEFAULT false,
created_at TIMESTAMP DEFAULT now()
);

CREATE POLICY "Drivers can view own profile"
ON drivers
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
);

DROP TABLE IF EXISTS drivers CASCADE;
CREATE TABLE drivers (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  user_name TEXT,
  email TEXT UNIQUE NOT NULL,
  phone TEXT UNIQUE,
  nic_number TEXT UNIQUE,
  date_of_birth DATE,
  address TEXT,
  driver_status TEXT CHECK (
    driver_status IN ('pending', 'active', 'suspended', 'rejected')
  ) DEFAULT 'pending',
  driver_type TEXT CHECK (
    driver_type IN ('bike', 'car', 'auto', 'van')
  ),
  city TEXT,
  profile_photo_url TEXT,
  force_password_change BOOLEAN DEFAULT true,
  profile_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE POLICY "Drivers can view own profile"
ON drivers
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
);


CREATE POLICY "Drivers can update own profile"
ON drivers
FOR UPDATE
TO authenticated
USING (
  auth.uid() = id
)
WITH CHECK (
  auth.uid() = id
);
CREATE OR REPLACE FUNCTION update_driver_profile(
  p_phone TEXT,
  p_address TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE drivers
  SET phone = p_phone,
      address = p_address
  WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION update_driver_profile TO authenticated;

ALTER TABLE drivers
ADD COLUMN onboarding_step INT DEFAULT 1,
ADD COLUMN onboarding_completed BOOLEAN DEFAULT false;

create type food_available_time as enum (
  'breakfast',
  'lunch',
  'dinner'
);
create table if not exists foods (
  id uuid primary key default uuid_generate_v4(),

  restaurant_id uuid not null
    references restaurants(id) on delete cascade,

  name text not null,
  description text,
  image_url text,

  is_available boolean default true,

  available_time food_available_time[] not null,
  -- example: {'breakfast','lunch'}

  -- Regular size
  regular_size text,
  regular_portion text,
  regular_price numeric(10,2) not null check (regular_price >= 0),
  offer_price numeric(10,2) check (offer_price >= 0),

  -- Extra size
  extra_size text,
  extra_portion text,
  extra_price numeric(10,2) check (extra_price >= 0),

  -- ⭐ Average rating (auto-calculated)
  stars numeric(2,1) default 0 check (stars between 0 and 5),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- Restaurant menu loading
create index idx_foods_restaurant_id
on foods(restaurant_id);

-- Availability filtering
create index idx_foods_is_available
on foods(is_available);

-- Available time filtering (GIN index for arrays)
create index idx_foods_available_time
on foods using gin (available_time);

-- Rating sorting
create index idx_foods_stars
on foods(stars);

create table if not exists food_reviews (
  id uuid primary key default uuid_generate_v4(),

  food_id uuid not null
    references foods(id) on delete cascade,

  customer_id uuid not null
    references users(id) on delete cascade,

  stars integer not null check (stars between 1 and 5),
  comment text,

  created_at timestamptz default now(),

  -- One review per customer per food
  unique (food_id, customer_id)
);

create or replace function update_food_average_stars()
returns trigger as $$
begin
  update foods
  set stars = (
    select coalesce(round(avg(stars)::numeric, 1), 0)
    from food_reviews
    where food_id = coalesce(new.food_id, old.food_id)
  ),
  updated_at = now()
  where id = coalesce(new.food_id, old.food_id);

  return null;
end;
$$ language plpgsql;

create trigger trg_update_food_stars
after insert or update or delete
on food_reviews
for each row
execute function update_food_average_stars();
-- ============================================================================