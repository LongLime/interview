import pytest

from app.embeddings import cosine_similarity


def test_cosine_similarity_identical_vectors_is_one():
    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)


def test_cosine_similarity_orthogonal_vectors_is_zero():
    assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


def test_cosine_similarity_opposite_vectors_is_negative_one():
    assert cosine_similarity([1.0, 0.0], [-1.0, 0.0]) == pytest.approx(-1.0)


def test_cosine_similarity_scales_independent_of_magnitude():
    assert cosine_similarity([3.0, 4.0], [6.0, 8.0]) == pytest.approx(1.0)


def test_cosine_similarity_empty_vectors_return_zero():
    assert cosine_similarity([], [1.0]) == 0.0
    assert cosine_similarity([], []) == 0.0


def test_cosine_similarity_mismatched_lengths_return_zero():
    assert cosine_similarity([1.0, 2.0], [1.0]) == 0.0


def test_cosine_similarity_zero_vector_returns_zero():
    assert cosine_similarity([0.0, 0.0], [1.0, 0.0]) == 0.0
