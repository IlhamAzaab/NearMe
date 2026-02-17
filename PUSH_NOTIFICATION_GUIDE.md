# Push Notification Guide - Expo + Supabase

## Overview

This guide implements push notifications using **Expo Push Notifications** with Supabase. This is simpler than Firebase because:
- ✅ No Firebase project setup required
- ✅ Free unlimited push notifications
- ✅ Works seamlessly with Expo/React Native
- ✅ Only stores tokens in your existing Supabase database
- ✅ No additional backend dependencies needed
- ✅ **Works in PRODUCTION** (App Store & Play Store)

## Architecture

```
Mobile App (Expo) → Expo Push Token → Your Backend → Supabase (store token)
                                              ↓
                                     Expo Push API → APNs (iOS) / FCM (Android) → Device
```

---

## ⚠️ PRODUCTION REQUIREMENTS

### Android (Play Store) - No extra setup!
Expo Push Notifications work immediately on Android. When users download your app from Play Store, they will receive notifications without any additional configuration.

### iOS (App Store) - APNs Key Required!
For iOS production, you **MUST** configure Apple Push Notification service (APNs) keys. Without this, iOS users will NOT receive notifications.

---

## STEP 1: iOS Production Setup (REQUIRED for App Store)

### 1.1 Create Apple Developer Account
- Go to https://developer.apple.com
- Enroll in Apple Developer Program ($99/year)
- This is required to publish to App Store anyway

### 1.2 Create APNs Key (One-time setup)

1. Go to [Apple Developer Portal](https://developer.apple.com/account)
2. Click **Certificates, Identifiers & Profiles**
3. Click **Keys** in sidebar
4. Click **+** to create new key
5. Enter name: `NearMe Push Key`
6. Check **Apple Push Notifications service (APNs)**
7. Click **Continue** → **Register**
8. **IMPORTANT**: Download the `.p8` key file (you can only download once!)
9. Note the **Key ID** (10 characters like `ABC123DEFG`)
10. Note your **Team ID** (found in Membership section)

### 1.3 Add APNs Key to Expo

**Option A: Using Expo Dashboard (Recommended)**
1. Go to https://expo.dev
2. Sign in to your Expo account
3. Go to your project → **Credentials**
4. Select **iOS**
5. Click **Add a new credential** → **Push Key**
6. Upload your `.p8` file
7. Enter the Key ID and Team ID

**Option B: Using EAS CLI**
```bash
# Install EAS CLI if not installed
npm install -g eas-cli

# Login to Expo
eas login

# Configure credentials
eas credentials
# Select iOS → Push Notifications → Add new push key
# Upload .p8 file and enter Key ID + Team ID
```

### 1.4 Verify APNs Configuration
```bash
eas credentials
# Check that Push Key shows "Valid" status
```

---

## STEP 2: Configure app.json for Production

Update your `app.json` or `app.config.js`:

```json
{
  "expo": {
    "name": "NearMe",
    "slug": "nearme",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#FF6B35",
          "sounds": []
        }
      ]
    ],
    "ios": {
      "bundleIdentifier": "com.yourcompany.nearme",
      "supportsTablet": true,
      "infoPlist": {
        "UIBackgroundModes": ["remote-notification"]
      }
    },
    "android": {
      "package": "com.yourcompany.nearme",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "permissions": ["RECEIVE_BOOT_COMPLETED", "VIBRATE"]
    },
    "extra": {
      "eas": {
        "projectId": "your-project-id-from-expo"
      }
    }
  }
}
```

**Get your projectId:**
```bash
eas init
# This will create/link your project and add the projectId
```

---

## STEP 3: Backend Setup (Already Done!)

The backend is configured with:
- `POST /push/register-token` - Register Expo push token after login
- `POST /push/unregister-token` - Remove token on logout
- `POST /push/send-test` - Send test notification
- `GET /push/status` - Check service status

**No Firebase credentials needed!**

---

## STEP 4: Database Setup

Run this SQL in Supabase SQL Editor:

```sql
-- File: database/push_notification_tokens.sql
-- Already created - just run it in Supabase
```

---

## STEP 5: React Native Implementation (Production-Ready)

### Install Dependencies

```bash
npx expo install expo-notifications expo-device expo-constants
npm install @react-native-async-storage/async-storage
```

### Create Push Notification Service

Create `src/services/pushNotificationService.js`:

```javascript
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';

// ⚠️ IMPORTANT: Replace with your actual backend URL
// For production, use your deployed backend URL (e.g., https://api.nearme.com)
const API_URL = __DEV__ 
  ? 'http://192.168.1.100:5000'  // Your local IP for development
  : 'https://your-production-api.com'; // Your production backend URL

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Create Android notification channel (required for Android 8+)
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6B35',
    sound: 'default',
  });
}

class PushNotificationService {
  
  // Request permission for notifications
  async requestPermission() {
    // Must be a physical device
    if (!Device.isDevice) {
      console.log('⚠️ Push notifications only work on physical devices');
      return false;
    }

    // Check existing permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    // Request permission if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('❌ Push notification permission denied');
      // Optionally show alert to guide user to settings
      Alert.alert(
        'Notifications Disabled',
        'Enable notifications in Settings to receive updates about your orders and deliveries.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
      return false;
    }
    
    console.log('✅ Push notification permission granted');
    return true;
  }

  // Get Expo Push Token - THIS WORKS IN PRODUCTION!
  async getExpoPushToken() {
    try {
      if (!Device.isDevice) {
        console.log('Must use physical device for push notifications');
        return null;
      }

      // Get project ID - Required for EAS builds
      const projectId = Constants.expoConfig?.extra?.eas?.projectId 
        ?? Constants.easConfig?.projectId;

      if (!projectId) {
        console.error('❌ Missing projectId in app.json. Run: eas init');
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      console.log('📱 Expo Push Token:', tokenData.data);
      return tokenData.data; // Format: ExponentPushToken[xxx]
    } catch (error) {
      console.error('Error getting Expo push token:', error);
      return null;
    }
  }

  // Generate unique device ID
  async getDeviceId() {
    let deviceId = await AsyncStorage.getItem('deviceId');
    if (!deviceId) {
      // Generate unique ID that persists across app reinstalls
      deviceId = `${Platform.OS}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
  }

  // Register token with backend - CALL THIS AFTER LOGIN
  async registerToken(authToken) {
    try {
      const expoPushToken = await this.getExpoPushToken();
      if (!expoPushToken) {
        console.log('No Expo push token available');
        return false;
      }

      const deviceId = await this.getDeviceId();
      
      console.log('📤 Registering push token with backend...');
      
      const response = await fetch(`${API_URL}/push/register-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          expoPushToken,
          deviceType: Platform.OS, // 'android' or 'ios'
          deviceId,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        console.log('✅ Push token registered successfully');
        await AsyncStorage.setItem('expoPushToken', expoPushToken);
        return true;
      } else {
        console.error('❌ Failed to register push token:', data);
        return false;
      }
    } catch (error) {
      console.error('Register token error:', error);
      return false;
    }
  }

  // Unregister token on logout - IMPORTANT FOR SECURITY
  async unregisterToken(authToken) {
    try {
      const deviceId = await this.getDeviceId();
      
      await fetch(`${API_URL}/push/unregister-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ deviceId }),
      });

      await AsyncStorage.removeItem('expoPushToken');
      console.log('✅ Push token unregistered');
    } catch (error) {
      console.error('Unregister token error:', error);
    }
  }

  // Setup foreground notification handler
  setupForegroundHandler(navigation) {
    return Notifications.addNotificationReceivedListener(notification => {
      console.log('📬 Foreground notification received:', notification);
      
      const { title, body } = notification.request.content;
      const data = notification.request.content.data || {};

      // Notification will automatically show as banner (configured above)
      // Optional: Handle specific notification types
      if (data.type === 'order_update') {
        // Could refresh order status, etc.
      }
    });
  }

  // Setup notification tap handler (background/quit state)
  setupNotificationResponseHandler(navigation) {
    return Notifications.addNotificationResponseReceivedListener(response => {
      console.log('👆 Notification tapped:', response);
      
      const data = response.notification.request.content.data || {};
      this.handleNotificationPress(data, navigation);
    });
  }

  // Check for notification that opened the app (from quit state)
  async getInitialNotification(navigation) {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (response) {
      console.log('🚀 App opened from notification:', response);
      const data = response.notification.request.content.data || {};
      
      // Small delay to ensure navigation is ready
      setTimeout(() => {
        this.handleNotificationPress(data, navigation);
      }, 500);
    }
  }

  // Handle notification tap - navigate to appropriate screen
  handleNotificationPress(data, navigation) {
    const { type, screen, orderId, restaurantId, driverId } = data || {};
    console.log('🔀 Handling notification press:', { type, screen });

    switch (type) {
      case 'restaurant_approval':
      case 'driver_approval':
        // User was approved - navigate to login to refresh their status
        navigation?.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
        break;
      
      case 'order_update':
        // Navigate to order details
        if (orderId) {
          navigation?.navigate('OrderDetails', { orderId });
        }
        break;
      
      case 'new_order':
        // For restaurant admins - new order received
        navigation?.navigate('Orders');
        break;
      
      case 'new_delivery':
        // For drivers - new delivery available
        navigation?.navigate('AvailableDeliveries');
        break;
      
      default:
        // Navigate to specified screen or home
        if (screen) {
          navigation?.navigate(screen);
        }
        break;
    }
  }

  // Initialize everything - CALL THIS ON APP START
  async initialize(authToken, navigation) {
    console.log('🔔 Initializing push notifications...');
    
    const hasPermission = await this.requestPermission();
    
    if (hasPermission) {
      await this.registerToken(authToken);
      
      // Setup listeners
      const foregroundSubscription = this.setupForegroundHandler(navigation);
      const responseSubscription = this.setupNotificationResponseHandler(navigation);
      
      // Check if app was opened from notification
      await this.getInitialNotification(navigation);
      
      console.log('✅ Push notifications initialized');
      
      return {
        success: true,
        cleanup: () => {
          foregroundSubscription.remove();
          responseSubscription.remove();
        }
      };
    }

    return { success: false };
  }
}

export default new PushNotificationService();
```

### Setup in App.js

```javascript
import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import pushNotificationService from './services/pushNotificationService';

export default function App() {
  const navigationRef = useRef(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    const initPushNotifications = async () => {
      const token = await AsyncStorage.getItem('token');
      if (token && navigationRef.current) {
        const result = await pushNotificationService.initialize(
          token, 
          navigationRef.current
        );
        
        if (result.cleanup) {
          cleanupRef.current = result.cleanup;
        }
      }
    };

    const timer = setTimeout(initPushNotifications, 1000);

    return () => {
      clearTimeout(timer);
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      {/* Your navigation stack */}
    </NavigationContainer>
  );
}
```

### Register Token After Login

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import pushNotificationService from '../services/pushNotificationService';

const handleLoginSuccess = async (authToken, userRole, navigation) => {
  await AsyncStorage.setItem('token', authToken);
  await AsyncStorage.setItem('userRole', userRole);
  
  // Register push notification token
  await pushNotificationService.initialize(authToken, navigation);
  
  const homeScreen = userRole === 'driver' ? 'DriverHome' 
                   : userRole === 'admin' ? 'RestaurantDashboard' 
                   : 'Home';
  
  navigation.reset({
    index: 0,
    routes: [{ name: homeScreen }],
  });
};
```

### Unregister Token on Logout

```javascript
const handleLogout = async (navigation) => {
  const token = await AsyncStorage.getItem('token');
  
  if (token) {
    await pushNotificationService.unregisterToken(token);
  }
  
  await AsyncStorage.clear();
  
  navigation.reset({
    index: 0,
    routes: [{ name: 'Login' }],
  });
};
```

---

## STEP 6: Build & Deploy for Production

### Configure eas.json

Create `eas.json` in your project root:

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

### Build for Android (Play Store)

```bash
# Initialize EAS (one-time)
eas init

# Build AAB for Play Store
eas build --platform android --profile production

# Submit to Play Store (after build completes)
eas submit --platform android
```

### Build for iOS (App Store)

```bash
# Build for App Store (requires APNs key configured in Step 1!)
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios
```

---

## How It Works in Production

```
┌─────────────────────────────────────────────────────────────────┐
│                         PRODUCTION FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User downloads app from App Store / Play Store               │
│                         ↓                                        │
│  2. User logs in → App requests notification permission          │
│                         ↓                                        │
│  3. Expo generates push token (ExponentPushToken[xxx])           │
│                         ↓                                        │
│  4. Token sent to your backend → Stored in Supabase              │
│                         ↓                                        │
│  5. Manager approves driver/restaurant                           │
│                         ↓                                        │
│  6. Backend calls Expo Push API with token                       │
│                         ↓                                        │
│  7. Expo routes notification:                                    │
│     • Android → Google FCM → User's device                       │
│     • iOS → Apple APNs → User's device                           │
│                         ↓                                        │
│  8. User receives real push notification! 🎉                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Android Production - Works Automatically!
- Expo handles Firebase Cloud Messaging (FCM) internally
- No Firebase project setup needed on your end
- Users will receive notifications immediately after download

### iOS Production - Requires APNs Key (Step 1)
- Apple requires all push notifications to go through APNs
- APNs key must be configured in your Expo account
- Without this, iOS users will NOT receive notifications

---

## Testing Before Production

### 1. Test via Expo Push Tool (FREE)

1. Run your app on physical device
2. Get the token from console logs: `ExponentPushToken[xxxxx]`
3. Go to: https://expo.dev/notifications
4. Paste the token
5. Enter title and body
6. Click "Send a Notification"
7. You should receive it on your device!

### 2. Test via Backend API

```bash
# Replace with your actual token
curl -X POST http://localhost:5000/push/send-test \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "body": "Hello from NearMe!"}'
```

### 3. Test Approval Flow (End-to-End)

1. Open mobile app → Login as driver/admin (pending approval)
2. Open web dashboard → Login as manager
3. Go to verification → Approve the driver/restaurant
4. Mobile app should receive push notification!

---

## Notification Types

| Type | Trigger | Who Receives | Navigation |
|------|---------|--------------|------------|
| `restaurant_approval` | Manager approves restaurant | Restaurant Admin | Login screen |
| `driver_approval` | Manager approves driver | Driver | Login screen |
| `order_update` | Order status changes | Customer | Order Details |
| `new_order` | New order placed | Restaurant Admin | Orders screen |
| `new_delivery` | Delivery assigned | Driver | Available Deliveries |

---

## Troubleshooting

### No Notifications on Android?

1. **Use physical device** - Emulators don't support push
2. **Check permissions** - Settings → App → Notifications → Enable
3. **Verify token** - Check console for `Expo Push Token: ExponentPushToken[xxx]`
4. **Test with Expo tool** - https://expo.dev/notifications

### No Notifications on iOS?

1. **Use physical device** - Simulators don't support push (NEVER will!)
2. **Check APNs key** - Must be configured in Expo credentials
3. **Check permissions** - Settings → App → Notifications → Enable
4. **Verify provisioning** - App must be signed with push-enabled profile

### Token Not Generated?

1. Check internet connection
2. Check notification permissions
3. Verify `projectId` in app.json/app.config.js
4. Run `eas init` to link project

### "DeviceNotRegistered" Error?

- User uninstalled the app or revoked permissions
- Token is automatically deactivated by backend
- New token will be registered on next login

---

## Production Checklist ✅

Before submitting to App Store / Play Store:

### General
- [ ] Replace `API_URL` with production backend URL
- [ ] Run `eas init` to get projectId
- [ ] Test notifications on physical Android device
- [ ] Test notifications on physical iOS device

### Android
- [ ] Test notification in foreground (shows banner)
- [ ] Test notification in background (tap navigates)
- [ ] Test notification when app is killed (tap opens app & navigates)

### iOS
- [ ] Configure APNs key in Expo credentials
- [ ] Verify APNs key status shows "Valid"
- [ ] Test on real iPhone (not simulator!)
- [ ] Test notification permission request works

### Backend
- [ ] Run database migration (push_notification_tokens.sql)
- [ ] Verify `/push/status` returns "ready"
- [ ] Test manager approval triggers notification

---

## API Reference

### Register Token
```http
POST /push/register-token
Authorization: Bearer <auth_token>
Content-Type: application/json

{
  "expoPushToken": "ExponentPushToken[xxxxxx]",
  "deviceType": "android",
  "deviceId": "android_1234567890_abc123"
}
```

### Unregister Token
```http
POST /push/unregister-token
Authorization: Bearer <auth_token>
Content-Type: application/json

{
  "deviceId": "android_1234567890_abc123"
}
```

### Send Test Notification
```http
POST /push/send-test
Authorization: Bearer <auth_token>
Content-Type: application/json

{
  "title": "Test Notification",
  "body": "Hello from NearMe!"
}
```

### Check Service Status
```http
GET /push/status
```

Response:
```json
{
  "service": "Expo Push Notifications",
  "status": "ready",
  "message": "Using Expo Push API - no additional configuration needed!"
}
```

---

## Summary

| Platform | Works in Production? | Extra Setup Required |
|----------|---------------------|---------------------|
| **Android** | ✅ YES | None! |
| **iOS** | ✅ YES | APNs key (one-time, 5 minutes) |

**Important**: The implementation uses **Expo Push Notifications**, which handles all the complexity of FCM (Android) and APNs (iOS) for you. Your backend simply calls the Expo Push API, and Expo routes the notification to the correct platform.

Users who download your app from Play Store or App Store **WILL** receive real push notifications!
