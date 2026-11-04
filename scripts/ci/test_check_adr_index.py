"""Pure regression tests for collision labels; no repository ADR is read or written."""
import unittest

import check_adr_index as adr


def names(count):
    return [f"2026-item-{rank:04d}.md" for rank in range(count)]


class CollisionLabelsTests(unittest.TestCase):
    def test_single_members_keep_their_unsuffixed_number(self):
        self.assertEqual(adr.expected_labels(["2026-only.md", "003x-history.md"]),
                         {"2026-only.md": "2026", "003x-history.md": "003x"})

    def test_existing_groups_of_at_most_twenty_six_are_unchanged(self):
        for count in range(2, 27):
            with self.subTest(count=count):
                members = names(count)
                expected = {member: "2026" + chr(ord("a") + rank)
                            for rank, member in enumerate(members)}
                self.assertEqual(adr.expected_labels(list(reversed(members))), expected)

    def test_alphabetic_boundaries(self):
        for count, suffix in [(26, "z"), (27, "aa"), (52, "az"), (53, "ba")]:
            with self.subTest(count=count):
                members = names(count)
                self.assertEqual(adr.expected_labels(members)[members[-1]], "2026" + suffix)

    def test_large_collision_groups_have_unique_ascii_letter_suffixes(self):
        members = names(1024)
        labels = adr.expected_labels(list(reversed(members)))
        self.assertEqual(len(set(labels.values())), len(members))
        suffixes = [labels[member][4:] for member in members]
        self.assertTrue(all(suffixes))
        self.assertTrue(all("a" <= letter <= "z" for suffix in suffixes for letter in suffix))

    def test_rebuilt_table_keeps_slug_order_and_valid_labels(self):
        members = names(53)
        unordered = list(reversed(members)) + ["003x-history.md", "0001-first.md"]
        rows = [("old", member, ["Title", "Accepted", "2026-11-04", "Runtime"])
                for member in unordered]
        rebuilt = adr.read_index_rows("\n".join(adr.rebuild_table(unordered, rows)))
        self.assertEqual([target for _label, target, _cells in rebuilt],
                         ["0001-first.md", "003x-history.md"] + members)
        self.assertEqual([label for label, _target, _cells in rebuilt][27:30],
                         ["2026z", "2026aa", "2026ab"])
        self.assertEqual(adr.check_index(unordered, rebuilt), [])


if __name__ == "__main__":
    unittest.main()
