"""Manual test 34: Weather tool — real Open-Meteo API.

Usage: cd packages/execution && uv run python tests/manual/test_34_weather_real.py
"""

from app.tools.weather import WeatherTool


def main():
    print("── Test 34: Weather real API ──")

    tool = WeatherTool()

    # 1. Current weather by city name
    result = tool.run({"location": "London", "action": "current"})
    assert result["success"] is True, f"Current failed: {result.get('error')}"
    assert "Temperature" in result["result"]
    print(f"  ✓ Current weather:\n    {result['result']}")

    # 2. Forecast by city name
    result = tool.run({"location": "Tokyo", "action": "forecast"})
    assert result["success"] is True, f"Forecast failed: {result.get('error')}"
    assert "forecast" in result["result"].lower()
    print(f"  ✓ Forecast:\n    {result['result'][:300]}")

    # 3. Direct lat/lon (Sydney)
    result = tool.run({"location": "-33.87, 151.21", "action": "current"})
    assert result["success"] is True, f"Lat/lon failed: {result.get('error')}"
    print(f"  ✓ Lat/lon weather:\n    {result['result']}")

    # 4. Unknown location
    result = tool.run({"location": "Xyzzyville99"})
    assert result["success"] is False
    assert result["recoverable"] is False
    print(f"  ✓ Unknown location: {result['error']}")

    print("\n✅ All weather tests passed")


if __name__ == "__main__":
    main()
