"""Foreground matting with DIS / ISNet general-use (rembg's isnet-general-use.onnx, Apache-2.0).

get_mask(img_rgb_uint8, model_path) -> float mask in [0,1], same size as the input.
"""
import cv2
import numpy as np
import onnxruntime as ort

_sessions = {}


def _session(path):
    if path not in _sessions:
        opts = ort.SessionOptions()
        opts.enable_cpu_mem_arena = False
        opts.enable_mem_pattern = False
        _sessions[path] = ort.InferenceSession(path, opts, providers=["CPUExecutionProvider"])
    return _sessions[path]


def get_mask(img, model_path, s=1024):
    sess = _session(model_path)
    h0, w0 = img.shape[:2]
    x = cv2.resize(img, (s, s), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    x = x - np.array([0.485, 0.456, 0.406], np.float32)
    x = np.transpose(x, (2, 0, 1))[None].astype(np.float32)
    m = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
    m = (m - m.min()) / (m.max() - m.min() + 1e-8)
    return cv2.resize(m, (w0, h0), interpolation=cv2.INTER_LINEAR)


def get_mask_birefnet(img, model_path, s=1024, letterbox=True):
    """BiRefNet (MIT) dichotomous segmentation; better than ISNet on lettering and thin shapes."""
    sess = _session(model_path)
    h0, w0 = img.shape[:2]
    if letterbox:
        side = max(h0, w0)
        pad = np.zeros((side, side, 3), np.uint8)
        pad[:] = np.median(img.reshape(-1, 3), axis=0)
        oy, ox = (side - h0) // 2, (side - w0) // 2
        pad[oy:oy + h0, ox:ox + w0] = img
    else:
        pad, oy, ox, side = img, 0, 0, None
    x = cv2.resize(pad, (s, s), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    x = np.transpose(x, (2, 0, 1))[None].astype(np.float32)
    m = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
    m = 1.0 / (1.0 + np.exp(-m))
    if letterbox:
        m = cv2.resize(m, (side, side), interpolation=cv2.INTER_LINEAR)[oy:oy + h0, ox:ox + w0]
    else:
        m = cv2.resize(m, (w0, h0), interpolation=cv2.INTER_LINEAR)
    return m
