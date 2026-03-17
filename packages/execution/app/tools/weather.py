"""Weather tool — current conditions and forecast via Open-Meteo API."""

from __future__ import annotations

import re

import httpx

from app.tools.base import BaseTool, ToolParameter

_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
_TIMEOUT = 10
_LATLON_RE = re.compile(r"^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$")


class WeatherTool(BaseTool):
    name = "weather"
    description = "Get current weather or 7-day forecast for a location"
    parameters = [
        ToolParameter(
            name="location",
            type="string",
            required=True,
            description="City name or lat,lon",
            examples=["London", "48.8566,2.3522"],
        ),
        ToolParameter(
            name="action",
            type="string",
            required=False,
            description="current or forecast",
            default="current",
            examples=["current", "forecast"],
        ),
    ]

    def run(self, inputs: dict) -> dict:
        location = inputs.get("location", "").strip()
        action = inputs.get("action", "current")

        if not location:
            return {
                "success": False,
                "error": "No location provided",
                "recoverable": False,
            }

        lat, lon = self._parse_latlon(location)
        if lat is None:
            result = self._geocode(location)
            if not result["success"]:
                return result
            lat, lon = result["lat"], result["lon"]

        if action == "current":
            return self._current(lat, lon, location)
        if action == "forecast":
            return self._forecast(lat, lon, location)

        return {
            "success": False,
            "error": f"Unknown action: {action}",
            "recoverable": False,
        }

    def _parse_latlon(self, location: str) -> tuple[float | None, float | None]:
        match = _LATLON_RE.match(location)
        if not match:
            return None, None
        lat, lon = float(match.group(1)), float(match.group(2))
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return None, None
        return lat, lon

    def _geocode(self, location: str) -> dict:
        try:
            resp = httpx.get(
                _GEOCODE_URL,
                params={"name": location, "count": 1, "format": "json"},
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", [])
            if not results:
                return {
                    "success": False,
                    "error": f"Location not found: {location}",
                    "recoverable": False,
                }
            return {
                "success": True,
                "lat": results[0]["latitude"],
                "lon": results[0]["longitude"],
            }
        except httpx.TimeoutException:
            return {
                "success": False,
                "error": "Geocoding timed out",
                "recoverable": True,
            }
        except httpx.HTTPError as exc:
            return {
                "success": False,
                "error": f"Geocoding error: {exc}",
                "recoverable": True,
            }

    def _current(self, lat: float, lon: float, location: str) -> dict:
        try:
            resp = httpx.get(
                _FORECAST_URL,
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,relative_humidity_2m,"
                    "wind_speed_10m,weather_code",
                },
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            current = data.get("current", {})
            text = (
                f"Location: {location}\n"
                f"Temperature: {current.get('temperature_2m', 'N/A')}°C\n"
                f"Humidity: {current.get('relative_humidity_2m', 'N/A')}%\n"
                f"Wind: {current.get('wind_speed_10m', 'N/A')} km/h\n"
                f"Weather code: {current.get('weather_code', 'N/A')}"
            )
            return {
                "success": True,
                "result": text,
                "source": "open-meteo",
                "truncated": False,
            }
        except httpx.TimeoutException:
            return {
                "success": False,
                "error": "Weather request timed out",
                "recoverable": True,
            }
        except httpx.HTTPError as exc:
            return {
                "success": False,
                "error": f"Weather error: {exc}",
                "recoverable": True,
            }

    def _forecast(self, lat: float, lon: float, location: str) -> dict:
        try:
            resp = httpx.get(
                _FORECAST_URL,
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "daily": "temperature_2m_max,temperature_2m_min,weather_code",
                    "forecast_days": 7,
                },
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            daily = data.get("daily", {})
            dates = daily.get("time", [])
            highs = daily.get("temperature_2m_max", [])
            lows = daily.get("temperature_2m_min", [])
            codes = daily.get("weather_code", [])

            lines = [f"7-day forecast for {location}:"]
            for i, date in enumerate(dates):
                high = highs[i] if i < len(highs) else "N/A"
                low = lows[i] if i < len(lows) else "N/A"
                code = codes[i] if i < len(codes) else "N/A"
                lines.append(f"  {date}: {low}°C – {high}°C (code {code})")

            return {
                "success": True,
                "result": "\n".join(lines),
                "source": "open-meteo",
                "truncated": False,
            }
        except httpx.TimeoutException:
            return {
                "success": False,
                "error": "Forecast request timed out",
                "recoverable": True,
            }
        except httpx.HTTPError as exc:
            return {
                "success": False,
                "error": f"Forecast error: {exc}",
                "recoverable": True,
            }
