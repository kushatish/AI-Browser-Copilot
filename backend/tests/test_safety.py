from unittest.mock import MagicMock, patch
import pytest
from services.agent import run_agent
from services.vectordb import store_page, clear_memory


def response(name, arguments):
    function = MagicMock()
    function.name = name
    function.arguments = arguments
    return MagicMock(choices=[MagicMock(message=MagicMock(tool_calls=[MagicMock(function=function)]))])


@pytest.mark.parametrize('name,args', [
    ('navigate_to_url', '{"url":"javascript:alert(1)","description":"open"}'),
    ('click_element', '{"description":"click"}'),
    ('fill_input', '[]'),
    ('unknown_tool', '{}'),
])
def test_invalid_actions_are_rejected(name, args):
    with patch('services.agent.client') as client:
        client.chat.completions.create.return_value = response(name, args)
        assert run_agent('do task', {'url': 'https://example.com'})[0]['type'] == 'message'


def test_model_cannot_override_action_type():
    with patch('services.agent.client') as client:
        client.chat.completions.create.return_value = response('click_element', '{"selector":"#x","description":"click","type":"navigate_to_url"}')
        assert run_agent('do task', {})[0]['type'] == 'click_element'


def test_revisit_replaces_old_passages():
    with patch('services.vectordb.collection') as collection:
        store_page('https://example.com#section', 'Example', 'x' * 4000)
        collection.delete.assert_called_once_with(where={'url': 'https://example.com'})
        chunks = collection.upsert.call_args.kwargs['documents']
        assert len(chunks) > 1
        assert all(len(chunk) <= 1500 for chunk in chunks)


def test_delete_memory():
    with patch('services.vectordb.collection') as collection:
        clear_memory()
        collection.delete.assert_called_once()


def test_unsafe_memory_url_rejected():
    with pytest.raises(ValueError):
        store_page('file:///secret', 'Secret', 'content')
