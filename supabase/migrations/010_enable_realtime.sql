do $$
declare
  table_name text;
  realtime_tables text[] := array[
    'profiles',
    'shops',
    'products',
    'product_skus',
    'orders',
    'order_items',
    'sales_targets'
  ];
begin
  foreach table_name in array realtime_tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    exception
      when duplicate_object then
        null;
      when undefined_object then
        null;
    end;
  end loop;
end $$;
