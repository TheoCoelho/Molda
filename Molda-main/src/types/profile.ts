// src/types/profile.ts
export type Profile = {
  id: string;
  full_name: string;
  username: string;
  phone?: string | null;
  birth_date?: string | null; // ISO yyyy-mm-dd
  cpf?: string | null;
  created_at?: string;
  updated_at?: string;
};
