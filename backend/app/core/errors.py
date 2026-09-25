from fastapi import HTTPException


class ApiError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str, extra: dict | None = None):
        super().__init__(status_code=status_code, detail={"code": code, "message": message, **(extra or {})})


def not_found(entity: str = "Risorsa"):
    return ApiError(404, "NOT_FOUND", f"{entity} non trovata")


def forbidden(message: str = "Operazione non consentita per il tuo ruolo"):
    return ApiError(403, "FORBIDDEN_ROLE", message)


def scope_denied():
    return ApiError(403, "TOURNAMENT_SCOPE", "Non hai accesso a questo torneo")


def read_only():
    return ApiError(409, "TOURNAMENT_READ_ONLY", "Il torneo è archiviato ed è di sola lettura")


def conflict(message: str):
    return ApiError(409, "CONFLICT", message)


def bad_request(message: str):
    return ApiError(400, "VALIDATION", message)
