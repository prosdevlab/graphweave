"""Weather tool tests."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx

from app.tools.weather import WeatherTool


def _weather(inputs: dict) -> dict:
    return WeatherTool().run(inputs)


def test_current_weather():
    geo_resp = MagicMock()
    geo_resp.json.return_value = {"results": [{"latitude": 40.71, "longitude": -74.01}]}
    geo_resp.raise_for_status = MagicMock()

    weather_resp = MagicMock()
    weather_resp.json.return_value = {
        "current": {
            "temperature_2m": 22.5,
            "relative_humidity_2m": 55,
            "wind_speed_10m": 12.3,
            "weather_code": 1,
        }
    }
    weather_resp.raise_for_status = MagicMock()

    with patch("app.tools.weather.httpx.get", side_effect=[geo_resp, weather_resp]):
        result = _weather({"location": "New York", "action": "current"})

    assert result["success"] is True
    assert "22.5" in result["result"]
    assert "55" in result["result"]
    assert result["source"] == "open-meteo"


def test_forecast():
    geo_resp = MagicMock()
    geo_resp.json.return_value = {"results": [{"latitude": 48.85, "longitude": 2.35}]}
    geo_resp.raise_for_status = MagicMock()

    forecast_resp = MagicMock()
    forecast_resp.json.return_value = {
        "daily": {
            "time": ["2026-03-14", "2026-03-15"],
            "temperature_2m_max": [18.0, 20.0],
            "temperature_2m_min": [10.0, 12.0],
            "weather_code": [1, 3],
        }
    }
    forecast_resp.raise_for_status = MagicMock()

    with patch("app.tools.weather.httpx.get", side_effect=[geo_resp, forecast_resp]):
        result = _weather({"location": "Paris", "action": "forecast"})

    assert result["success"] is True
    assert "2026-03-14" in result["result"]
    assert "18.0" in result["result"]


def test_unknown_location():
    geo_resp = MagicMock()
    geo_resp.json.return_value = {"results": []}
    geo_resp.raise_for_status = MagicMock()

    with patch("app.tools.weather.httpx.get", return_value=geo_resp):
        result = _weather({"location": "Xyzzyville"})

    assert result["success"] is False
    assert "not found" in result["error"].lower()
    assert result["recoverable"] is False


def test_timeout():
    with patch(
        "app.tools.weather.httpx.get",
        side_effect=httpx.TimeoutException("timed out"),
    ):
        result = _weather({"location": "London"})

    assert result["success"] is False
    assert result["recoverable"] is True


def test_latlon_input_skips_geocoding():
    weather_resp = MagicMock()
    weather_resp.json.return_value = {
        "current": {
            "temperature_2m": 30.0,
            "relative_humidity_2m": 80,
            "wind_speed_10m": 5.0,
            "weather_code": 0,
        }
    }
    weather_resp.raise_for_status = MagicMock()

    with patch("app.tools.weather.httpx.get", return_value=weather_resp) as mock_get:
        result = _weather({"location": "-33.87, 151.21", "action": "current"})

    assert result["success"] is True
    # Only one call (weather), no geocoding call
    assert mock_get.call_count == 1
    call_params = mock_get.call_args[1]["params"]
    assert float(call_params["latitude"]) == -33.87
    assert float(call_params["longitude"]) == 151.21
