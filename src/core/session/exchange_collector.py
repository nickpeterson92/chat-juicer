"""Collect recent user-assistant exchanges for preservation."""

from __future__ import annotations

from agents import TResponseInputItem

from utils.logger import logger


class ExchangeCollector:
    """Collects the most recent complete user-assistant exchanges.

    Uses optimized reverse scan with early termination:
    - Scans backward from end of conversation
    - Stops when enough exchanges found (O(k) vs O(n))
    - Preserves chronological order in result
    """

    @staticmethod
    def collect_recent_exchanges(items: list[TResponseInputItem], keep_recent: int) -> list[TResponseInputItem]:
        """Collect last N complete user-assistant exchanges.

        Args:
            items: All conversation items
            keep_recent: Number of recent user messages to keep

        Returns:
            List of items from recent exchanges (chronological order)
        """
        if not items or keep_recent <= 0:
            logger.info(f"No items or keep_recent={keep_recent}")
            return []

        # Reverse scan with early exit
        exchanges_found = 0
        result_indices = []
        pending_assistant_idx = None

        for i in range(len(items) - 1, -1, -1):
            item = items[i]
            role = item.get("role")

            # Skip tool results (but NOT assistant messages with tool_calls)
            if role == "tool":
                continue

            if role == "assistant":
                pending_assistant_idx = i

            elif role == "user" and pending_assistant_idx is not None:
                # Complete exchange found
                result_indices.append((i, pending_assistant_idx))
                pending_assistant_idx = None
                exchanges_found += 1

                # EARLY EXIT: Stop when enough exchanges collected
                if exchanges_found >= keep_recent:
                    logger.info(
                        f"Early exit after scanning {len(items) - i} items " f"(found {exchanges_found} exchanges)"
                    )
                    break

        # Handle orphaned assistant message at end
        if pending_assistant_idx is not None and exchanges_found < keep_recent:
            result_indices.append((pending_assistant_idx, pending_assistant_idx))
            exchanges_found += 1

        # Restore chronological order
        result_indices.reverse()

        # Extract items (only user/assistant roles)
        result = [
            items[i]
            for start_idx, end_idx in result_indices
            for i in range(start_idx, end_idx + 1)
            if items[i].get("role") in ["user", "assistant"]
        ]

        logger.info(f"Collected {len(result)} items from {exchanges_found} exchanges")
        return result
