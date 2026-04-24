from curator import pipeline


def test_flag_starts_clear():
    pipeline.reset_cancel()
    assert pipeline.should_cancel() is False


def test_request_cancel_sets_flag():
    pipeline.reset_cancel()
    pipeline.request_cancel()
    assert pipeline.should_cancel() is True


def test_reset_clears_flag():
    pipeline.request_cancel()
    pipeline.reset_cancel()
    assert pipeline.should_cancel() is False


def test_raises_if_cancelled_raises():
    pipeline.reset_cancel()
    pipeline.request_cancel()
    try:
        pipeline.raise_if_cancelled()
        raised = False
    except pipeline.Cancelled:
        raised = True
    assert raised
    pipeline.reset_cancel()
