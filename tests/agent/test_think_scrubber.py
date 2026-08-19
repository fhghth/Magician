"""Tests for StreamingThinkScrubber.

These tests lock in the contract the scrubber must satisfy so downstream
consumers (ACP, api_server, TTS, CLI, gateway) never see reasoning
blocks leaking through the stream_delta_callback.  The scenarios map
directly to the MiniMax-M2.7 / DeepSeek / Qwen3 streaming patterns that
break the older per-delta regex strip.
"""

from __future__ import annotations

import pytest

from agent.think_scrubber import StreamingThinkScrubber


def _drive(scrubber: StreamingThinkScrubber, deltas: list[str]) -> str:
    """Feed a sequence of deltas and return the concatenated visible output."""
    out = [scrubber.feed(d) for d in deltas]
    out.append(scrubber.flush())
    return "".join(out)


class TestClosedPairs:
    """Closed <tag>...</tag> pairs are always stripped, regardless of boundary."""

    def test_closed_pair_single_delta(self) -> None:
        s = StreamingThinkScrubber()
        assert _drive(s, ["<think>reasoning</think>Hello world"]) == "Hello world"


    @pytest.mark.parametrize(
        "tag",
        ["think", "thinking", "reasoning", "thought", "REASONING_SCRATCHPAD"],
    )
    def test_all_tag_variants(self, tag: str) -> None:
        s = StreamingThinkScrubber()
        delta = f"<{tag}>x</{tag}>Hello"
        assert _drive(s, [delta]) == "Hello"



class TestUnterminatedOpen:
    """Unterminated open tag discards all subsequent content to end of stream."""

    def test_open_at_stream_start(self) -> None:
        s = StreamingThinkScrubber()
        assert _drive(s, ["<think>reasoning text with no close"]) == ""



    def test_prose_mentioning_tag_not_stripped(self) -> None:
        """Mid-line '<think>' in prose is preserved (no boundary)."""
        s = StreamingThinkScrubber()
        text = "Use the <think> element for reasoning"
        assert _drive(s, [text]) == text


class TestOrphanClose:
    """Orphan close tags (no prior open) are stripped without boundary check."""

    def test_orphan_close_alone(self) -> None:
        s = StreamingThinkScrubber()
        assert _drive(s, ["Hello</think>world"]) == "Helloworld"




class TestPartialTagsAcrossDeltas:
    """Partial tags at delta boundaries must be held back, not emitted raw."""

    def test_split_open_tag_held_back(self) -> None:
        """'<' arrives alone, 'think>' completes it on next delta."""
        s = StreamingThinkScrubber()
        # At stream start, last_emitted_ended_newline=True, so <think> at 0 is boundary
        assert (
            _drive(s, ["<", "think>reasoning</think>done"])
            == "done"
        )

    def test_split_open_tag_not_at_boundary(self) -> None:
        """Mid-line split '<' + 'think>X</think>' is a closed pair.

        Closed pairs are always stripped (matching
        ``_strip_think_blocks`` case 1), even without a block
        boundary — a closed pair is an intentional bounded construct.
        """
        s = StreamingThinkScrubber()
        out = _drive(s, ["word<", "think>prose</think>more"])
        assert out == "wordmore"




class TestTheMiniMaxScenario:
    """The exact pattern run_agent per-delta regex strip breaks."""

    def test_minimax_split_open(self) -> None:
        """delta1='<think>', delta2='Let me check', delta3='</think>done'."""
        s = StreamingThinkScrubber()
        out = _drive(s, ["<think>", "Let me check their config", "</think>", "done"])
        assert out == "done"


    def test_minimax_unterminated_reasoning_at_end(self) -> None:
        """Unclosed reasoning at stream end is dropped entirely."""
        s = StreamingThinkScrubber()
        out = _drive(s, ["<think>", "The user wants", " to know something"])
        assert out == ""


class TestResetAndReentry:
    def test_reset_clears_in_block_state(self) -> None:
        s = StreamingThinkScrubber()
        s.feed("<think>hanging")
        assert s._in_block is True
        s.reset()
        assert s._in_block is False
        # After reset, a new turn works cleanly
        assert _drive(s, ["Hello world"]) == "Hello world"

    def test_reset_clears_buffered_partial_tag(self) -> None:
        s = StreamingThinkScrubber()
        s.feed("word<")
        assert s._buf == "<"
        s.reset()
        assert s._buf == ""
        assert _drive(s, ["fresh content"]) == "fresh content"


class TestFlushBehaviour:



    def test_flush_restores_stream_start_boundary(self) -> None:
        """End-of-stream flush must re-arm block-boundary gating.

        Thinking-only / empty-response retries flush then stream again
        without ``reset()``.  If flush left ``_last_emitted_ended_newline``
        False (e.g. after emitting a held-back ``<``), the next stream's
        opening ``<think>`` looked mid-line and leaked into the UI.
        """
        s = StreamingThinkScrubber()
        assert s.feed("word") == "word"
        assert s._last_emitted_ended_newline is False
        assert s.flush() == ""
        assert s._last_emitted_ended_newline is True
        assert (
            _drive(s, ["<think>", "secret reasoning", "</think>", "Visible answer"])
            == "Visible answer"
        )

    def test_flush_partial_tag_tail_does_not_poison_next_stream(self) -> None:
        """Flushing a held-back ``<`` must not make the next open tag leak."""
        s = StreamingThinkScrubber()
        s.feed("word<")
        assert s.flush() == "<"
        assert s._last_emitted_ended_newline is True
        assert _drive(s, ["<think>hidden</think>Hello"]) == "Hello"


class TestRealisticStreaming:
    """Character-by-character streaming must work as well as larger chunks."""

    def test_char_by_char_closed_pair(self) -> None:
        s = StreamingThinkScrubber()
        deltas = list("<think>x</think>Hello world")
        assert _drive(s, deltas) == "Hello world"


    def test_reasoning_then_real_response_first_word_preserved(self) -> None:
        """Regression: the first word of the final response must NOT be eaten.

        Stefan's screenshot bug — 'Let me check' was being rendered as
        ' me check'.  The scrubber must not consume any character of
        post-close content.
        """
        s = StreamingThinkScrubber()
        deltas = [
            "<think>",
            "User wants to know things",
            "</think>",
            "Let me check their config.",
        ]
        assert _drive(s, deltas) == "Let me check their config."

    def test_no_tag_passthrough_is_identical(self) -> None:
        """Streams without any reasoning tags pass through byte-for-byte."""
        s = StreamingThinkScrubber()
        deltas = ["Hello ", "world ", "how ", "are ", "you?"]
        assert _drive(s, deltas) == "Hello world how are you?"


class TestReasoningCollection:
    """Stripped block content is collected for live reasoning display.

    Ollama's OpenAI-compatible endpoint streams thinking inline in
    ``delta.content`` wrapped in <think> tags instead of a structured
    ``reasoning_content`` field.  The scrubber must expose the stripped
    text via ``take_reasoning()`` so the agent can forward it to the
    reasoning display while keeping the visible reply scrubbed.
    """

    def test_single_delta_collected(self) -> None:
        s = StreamingThinkScrubber()
        assert s.feed("<think>Let me reason</think>Hello") == "Hello"
        assert s.take_reasoning() == "Let me reason"
        assert s.take_reasoning() == ""

    def test_split_tags_across_deltas(self) -> None:
        """The MiniMax/Ollama pattern: '<think>' and '</think>' alone."""
        s = StreamingThinkScrubber()
        assert s.feed("<think>") == ""
        assert s.feed("User wants the truth") == ""
        assert s.feed("</think>") == ""
        assert s.feed("Visible answer") == "Visible answer"
        assert s.take_reasoning() == "User wants the truth"

    def test_partial_tag_boundary_no_duplicates(self) -> None:
        """Reasoning split at a partial close-tag boundary must not double-collect."""
        s = StreamingThinkScrubber()
        assert s.feed("<think>AAA</thi") == ""
        assert s.feed("nk>BBB") == "BBB"
        assert s.take_reasoning() == "AAA"

    def test_multiple_blocks_concatenated(self) -> None:
        s = StreamingThinkScrubber()
        assert s.feed("<think>First</think>mid\n<think>Second</think>end") == "mid\nend"
        assert s.take_reasoning() == "FirstSecond"

    def test_no_tags_collects_nothing(self) -> None:
        s = StreamingThinkScrubber()
        assert s.feed("plain text") == "plain text"
        assert s.take_reasoning() == ""

    def test_reset_clears_collected_reasoning(self) -> None:
        s = StreamingThinkScrubber()
        s.feed("<think>stale</think>")
        s.reset()
        assert s.take_reasoning() == ""
        assert s.feed("<think>fresh</think>x") == "x"
        assert s.take_reasoning() == "fresh"

    def test_interleaved_with_visible_chunks(self) -> None:
        """Realistic Ollama stream: reasoning chunks interleave with UI deltas."""
        s = StreamingThinkScrubber()
        visible = []
        for delta in ["<think>", "Step 1", "</think>", "Answer\n", "<think>", "Step 2", "</think>", "!"]:
            out = s.feed(delta)
            if out:
                visible.append(out)
        assert "".join(visible) == "Answer\n!"
        assert s.take_reasoning() == "Step 1Step 2"
