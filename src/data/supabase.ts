import { createClient } from '@supabase/supabase-js'

// 프로젝트 주소·publishable 키는 원래 웹페이지에 공개되는 값이다(데이터 보호는 DB의 RLS가 맡는다).
// 다른 Supabase 프로젝트로 돌릴 땐 .env.local에 VITE_SUPABASE_URL·VITE_SUPABASE_KEY를 넣는다.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://vwwrazzwzbaqfvsasvhb.supabase.co'
const key = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_R2wol6cddrX_LKVn0vWUhw_THQ8AUic'

export const supabase = createClient(url, key)
