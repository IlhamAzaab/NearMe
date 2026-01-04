-- enable uuid
create extension if not exists "uuid-ossp";

-- admins
create table if not exists admins (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  role text not null default 'admin',
  full_name text,
  nic_number text unique,
  date_of_birth date,
  phone text unique,
  home_address text,
  profile_photo_url text,
  nic_front text,
  nic_back text,
  profile_completed boolean not null default false,
  onboarding_step int not null default 1,
  onboarding_completed boolean not null default false,
  admin_status text not null default 'pending' check (admin_status in ('pending','active','rejected','suspended')),
  force_password_change boolean not null default true,
  verified boolean default false,
  verified_at timestamp with time zone,
  verified_by uuid,
  created_at timestamp with time zone not null default now()
);

-- restaurants
create table if not exists restaurants (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid references admins(id) on delete set null,
  restaurant_name text unique not null,
  business_registration_number text unique,
  address text,
  city text,
  postal_code text,
  latitude numeric,
  longitude numeric,
  opening_time TIME,
  close_time TIME,
  logo_url text,
  cover_image_url text,
  rejection_reason text,
  restaurant_status text not null default 'pending' check (restaurant_status in ('pending','active','rejected','suspended')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- back-link from admins to restaurants (added after restaurants exists to avoid circular dependency)
alter table admins
  add column if not exists restaurant_id uuid references restaurants(id) on delete set null;

-- bank accounts
create table if not exists restaurant_bank_accounts (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid references admins(id) on delete cascade,
  restaurant_id uuid references restaurants(id) on delete set null,
  account_holder_name text not null,
  bank_name text not null,
  branch text,
  account_number text not null,
  verified boolean default false,
  verified_at timestamp with time zone,
  verified_by uuid,
  created_at timestamp with time zone not null default now(),
  unique (admin_id, account_number)
);

-- contracts
create table if not exists restaurant_contracts (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid references admins(id) on delete cascade,
  restaurant_id uuid references restaurants(id) on delete set null,
  contract_version text not null default '1.0.0',
  accepted boolean not null default false,
  ip_address text,
  user_agent text,
  contract_html text,
  created_at timestamp with time zone not null default now()
);

-- indexes to speed lookups
create index if not exists idx_restaurants_admin_id on restaurants(admin_id);
create index if not exists idx_admins_restaurant_id on admins(restaurant_id);
create index if not exists idx_bank_accounts_admin on restaurant_bank_accounts(admin_id);