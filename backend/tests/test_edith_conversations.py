from fastapi.testclient import TestClient
import main


def test_conversation_endpoint_returns_messages():
    client = TestClient(main.app)
    session_id = "conversation-test-session"

    main.save_conversation_message(session_id, "user", "Hello EDITH")
    main.save_conversation_message(session_id, "assistant", "Hello! How can I help?")

    response = client.get(f"/api/assistant/conversations/{session_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert [m["role"] for m in data["messages"]] == ["user", "assistant"]


def test_conversation_endpoint_rejects_invalid_limit():
    client = TestClient(main.app)
    response = client.get("/api/assistant/conversations/test?limit=500")
    assert response.status_code == 422
