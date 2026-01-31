# Google Maps API Configuration Guide

## Overview

This application has been updated to use Google Maps SDK and Google Directions API instead of Leaflet and OSRM for route calculations and map displays.

## Setup Instructions

### 1. Get Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - **Maps JavaScript API** (for frontend map display)
   - **Directions API** (for route calculation)
   - **Distance Matrix API** (optional, for future enhancements)

4. Go to **APIs & Services** > **Credentials**
5. Click **Create Credentials** > **API Key**
6. Copy your API key
7. (Optional but recommended) Restrict your API key:
   - Application restrictions: HTTP referrers for frontend, IP addresses for backend
   - API restrictions: Select only the APIs you enabled

### 2. Configure Frontend

1. Navigate to the `frontend` directory
2. Create a `.env` file (copy from `.env.example` if available)
3. Add your Google Maps API key:
   ```env
   VITE_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY_HERE
   ```

### 3. Configure Backend

1. Navigate to the `backend` directory
2. Create or update your `.env` file
3. Add your Google Maps API key:
   ```env
   GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY_HERE
   ```

### 4. Install Dependencies

Frontend dependencies (`@react-google-maps/api`) are already included in `package.json`.

If you need to reinstall:

```bash
cd frontend
npm install
```

Backend doesn't require additional packages for Google Maps API (uses fetch).

### 5. Start the Application

**Frontend:**

```bash
cd frontend
npm run dev
```

**Backend:**

```bash
cd backend
npm start
```

## Features

### Google Maps Integration

#### Frontend (Available Deliveries Page)

- Interactive Google Maps with zoom and pan
- Custom markers for driver, restaurant, and customer locations
- Route polylines showing:
  - Driver to Restaurant (Black line)
  - Restaurant to Customer (Grey line)
- Info windows with location details

#### Backend (Route Calculation)

- Google Directions API for accurate route calculation
- Shortest distance algorithm (selects shortest route from alternatives)
- Extra distance calculation for route extensions
- Maintains the same earning calculation logic as OSRM

### Logic Preserved

The following logic has been **maintained exactly** as it was with OSRM:

1. **First Delivery**: Shows all deliveries with distance and earnings in green blocks
2. **Subsequent Deliveries**: When driver has accepted deliveries, shows:
   - Extra distance (how much more driving is added)
   - Extra earnings (including bonuses)
   - Purple "Route Extension Impact" block

3. **Distance Calculation**:
   - Shortest route selection from multiple alternatives
   - Micro-segment matching for common road detection
   - Return-via-same-path optimization

4. **Earnings Calculation**:
   - Rs. 40 per km rate
   - Delivery bonuses:
     - Rs. 25 for 2nd delivery
     - Rs. 30 for 3rd+ deliveries
   - Restaurant proximity requirements (1km max)

## Differences from OSRM

### Advantages of Google Maps

✅ More accurate route data for real-world conditions
✅ Better handling of traffic and road closures
✅ Higher quality map rendering
✅ Better geocoding accuracy
✅ Commercial support and reliability

### API Costs

⚠️ Google Maps APIs have usage costs after free tier

- Directions API: First 50,000 requests/month free
- Maps JavaScript API: $7 per 1,000 loads after free tier
- Monitor usage in Google Cloud Console

### Fallback

If Google Maps API key is not configured:

- Frontend will show "Google Maps API key not configured" message
- Backend will throw an error when trying to calculate routes

## Troubleshooting

### "Google Maps API key not configured" error

**Frontend:**

1. Check `.env` file in `frontend` directory
2. Ensure variable is named `VITE_GOOGLE_MAPS_API_KEY`
3. Restart the dev server after adding/changing .env

**Backend:**

1. Check `.env` file in `backend` directory
2. Ensure variable is named `GOOGLE_MAPS_API_KEY`
3. Restart the backend server

### API Key Restrictions

If routes aren't loading:

1. Check API key restrictions in Google Cloud Console
2. Ensure your domain/IP is allowed
3. Verify all required APIs are enabled

### Quota Exceeded

If you see quota errors:

1. Check your usage in Google Cloud Console
2. Enable billing or upgrade your plan
3. Implement request caching to reduce API calls

## Testing

1. Open Available Deliveries page as a driver
2. Verify map loads with Google Maps
3. Check that routes are displayed correctly
4. Verify distance and earnings calculations match expectations
5. Test accepting deliveries and check for extra distance calculations

## Support

For Google Maps API issues:

- [Google Maps Platform Documentation](https://developers.google.com/maps/documentation)
- [Google Maps Platform Support](https://developers.google.com/maps/support)

For application-specific issues:

- Check browser console for frontend errors
- Check backend logs for API errors
- Verify environment variables are set correctly
