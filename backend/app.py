import os
from flask import Flask, jsonify
from dotenv import load_dotenv
from routes_auth import auth_bp

load_dotenv()

def create_app():
    app = Flask(__name__)

    # Registra as rotas de autenticação
    app.register_blueprint(auth_bp, url_prefix="/auth")

    @app.get("/health")
    def health():
        return jsonify({"status": "ok"}), 200

    return app

app = create_app()

if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("FLASK_PORT", 8080))
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(host=host, port=port, debug=debug)
