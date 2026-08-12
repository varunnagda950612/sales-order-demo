do $$
begin
  begin
    alter publication supabase_realtime add table public.visit_proofs;
  exception
    when duplicate_object then
      null;
    when undefined_object then
      null;
  end;
end $$;
