from flask import Blueprint, request, jsonify
from .supabase_client import supabase

auth_bp = Blueprint("auth_bp", __name__)

@auth_bp.post("/register")
def register():
    """
    Cria usuário no Auth e upserta o profile com TODOS os campos.
    Este endpoint deve ser chamado pelo frontend.
    """
    data = request.get_json(force=True) or {}

    email = (data.get("email") or "").strip()
    password = data.get("password")
    full_name = (data.get("full_name") or "").strip()
    username = (data.get("username") or "").strip()
    phone = data.get("phone")
    birth_date = data.get("birth_date")  # 'YYYY-MM-DD' ou None
    cpf = data.get("cpf")

    # Validações mínimas
    missing = [k for k in ("email", "password", "full_name", "username") if not data.get(k)]
    if missing:
        return jsonify({"error": f"Campos obrigatórios ausentes: {', '.join(missing)}"}), 400

    # 1) Cria usuário no Auth (service role ignora RLS)
    try:
        res = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True  # ajuste conforme sua política
        })
        user = res.user
        if not user:
            return jsonify({"error": "Falha ao criar usuário no Auth."}), 400
        uid = user.id
    except Exception as e:
        return jsonify({"error": f"Erro ao criar usuário no Auth: {e}"}), 400

    # 2) Upsert do profile completo (inclui e-mail duplicado)
    payload = {
        "id": uid,
        "full_name": full_name,
        "username": username,
        "phone": phone,
        "birth_date": birth_date,  # 'YYYY-MM-DD' ou None
        "cpf": cpf,
        "email": email
    }

    try:
        insert = supabase.table("profiles").upsert(payload, on_conflict="id").execute()
    except Exception as e:
        # Opcional: rollback do user no Auth para não deixar conta "zumbi"
        try:
            supabase.auth.admin.delete_user(uid)
        except Exception:
            pass
        return jsonify({"error": f"Erro ao salvar profile: {e}"}), 400

    return jsonify({"user_id": uid, "profile": insert.data}), 201


@auth_bp.post("/login-info")
def login_info():
    """
    Este endpoint NÃO autentica (não cria sessão).
    É opcional e serve apenas para retornar o profile (server-side)
    caso você decida mover o login para o backend futuramente.
    Para sessão, use o supabase-js no frontend (recomendado).
    """
    data = request.get_json(force=True) or {}
    uid = data.get("user_id")
    if not uid:
        return jsonify({"error": "Informe 'user_id' (UUID)."}), 400

    try:
        profile = supabase.table("profiles").select(
            "id, full_name, username, phone, birth_date, cpf, email, created_at, updated_at"
        ).eq("id", uid).single().execute()
    except Exception as e:
        return jsonify({"error": f"Erro ao obter profile: {e}"}), 400

    return jsonify(profile.data), 200
