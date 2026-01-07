import struct


def pcm_to_wav(pcm_bytes, sample_rate=24000, channels=1, bits_per_sample=16):
    if pcm_bytes is None:
        pcm_bytes = b""
    if bits_per_sample != 16:
        raise ValueError("Only 16-bit PCM is supported for WAV wrapping.")
    if channels != 1:
        raise ValueError("Only mono PCM is supported for WAV wrapping.")
    if sample_rate != 24000:
        raise ValueError("Only 24kHz PCM is supported for WAV wrapping.")

    data_size = len(pcm_bytes)
    block_align = channels * bits_per_sample // 8
    byte_rate = sample_rate * block_align

    # RIFF chunk size = 4 (WAVE) + (8 + fmt) + (8 + data)
    riff_chunk_size = 36 + data_size

    header = (
        b"RIFF"
        + struct.pack("<I", riff_chunk_size)
        + b"WAVE"
        + b"fmt "
        + struct.pack(
            "<IHHIIHH",
            16,  # PCM fmt chunk size
            1,   # AudioFormat PCM
            channels,
            sample_rate,
            byte_rate,
            block_align,
            bits_per_sample,
        )
        + b"data"
        + struct.pack("<I", data_size)
    )
    return header + pcm_bytes
