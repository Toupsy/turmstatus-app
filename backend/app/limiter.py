from slowapi import Limiter
from slowapi.util import get_remote_address

# Gemeinsame Rate-Limiter-Instanz für die gesamte App.
limiter = Limiter(key_func=get_remote_address, default_limits=["240/minute"])
