// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAGk4GqJh4GCBUlV2lTMPqgzbKce2KDThY",
  authDomain: "ecomile-e4c89.firebaseapp.com",
  projectId: "ecomile-e4c89",
  storageBucket: "ecomile-e4c89.firebasestorage.app",
  messagingSenderId: "221186748593",
  appId: "1:221186748593:web:81c1c6ca58b7ceb4373290",
  measurementId: "G-DCHH36NDJ6"
};

// Wait for Firebase to load, then initialize
document.addEventListener('DOMContentLoaded', function() {
  if (typeof firebase === 'undefined') {
    console.error('Firebase not loaded');
    return;
  }
  
  // Initialize Firebase
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
});

// Initialize Firebase immediately if available
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Get Firebase services (these will be available after Firebase loads)
function getFirebaseServices() {
  if (typeof firebase !== 'undefined') {
    return {
      auth: firebase.auth(),
      db: firebase.firestore()
    };
  }
  return null;
}

// Global variables that will be set when Firebase loads
let auth, db, googleProvider;

// Set up auth and db when Firebase is ready
function initializeFirebaseServices() {
  if (typeof firebase !== 'undefined') {
    auth = firebase.auth();
    db = firebase.firestore();
    
    // Initialize Google Auth Provider
    googleProvider = new firebase.auth.GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    
    // Set up auth observer
    setupAuthObserver();
    
    return true;
  }
  return false;
}

function setupAuthObserver() {
  if (!auth) return;
  
  auth.onAuthStateChanged((user) => {
    console.log('Auth state changed:', user ? 'logged in' : 'logged out');
    if (user) {
      const userData = {
        uid: user.uid,
        name: user.displayName,
        email: user.email,
        photoURL: user.photoURL
      };
      localStorage.setItem('ecomiles_user', JSON.stringify(userData));
      console.log('User data saved to localStorage:', userData);
      initializeUserData(user);
    } else {
      localStorage.removeItem('ecomiles_user');
      console.log('User data removed from localStorage');
    }
  });
}

// Try to initialize immediately
initializeFirebaseServices();

// Also try when DOM loads
document.addEventListener('DOMContentLoaded', initializeFirebaseServices);

// Google Auth Provider (initialized after Firebase loads)

// Auth observer will be set up in setupAuthObserver()

// Create user doc if not exist
async function initializeUserData(user) {
  try {
    const userRef = db.collection('users').doc(user.uid);
    const docSnap = await userRef.get();
    if (!docSnap.exists) {
      await userRef.set({
        name: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        userType: 'user',
        points: 0,
        totalDistance: 0,
        roadTaxSaved: 0,
        journeys: [],
        isActive: true,
        showInLeaderboard: true, // Privacy setting for leaderboard visibility
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch (err) {
    console.error('Error initializing user data:', err);
  }
}

// Firebase helper functions
function getCurrentUser() {
  const str = localStorage.getItem('ecomiles_user');
  return str ? JSON.parse(str) : null;
}

function isUserLoggedIn() {
  // Check both localStorage and Firebase auth state
  const localUser = getCurrentUser();
  const firebaseUser = auth && auth.currentUser;
  
  return localUser !== null || firebaseUser !== null;
}

function requireAuth() {
  // Give Firebase time to initialize and check auth state
  if (typeof firebase === 'undefined') {
    console.log('Firebase not loaded yet, waiting...');
    setTimeout(() => {
      if (!isUserLoggedIn()) {
        window.location.href = 'login.html';
      }
    }, 1000);
    return true; // Don't redirect immediately
  }
  
  // Check both localStorage and Firebase auth state
  const localUser = getCurrentUser();
  const firebaseUser = auth && auth.currentUser;
  
  if (!localUser && !firebaseUser) {
    window.location.href = 'login.html';
    return false;
  }
  
  // If we have Firebase user but no localStorage, sync it
  if (firebaseUser && !localUser) {
    const userData = {
      uid: firebaseUser.uid,
      name: firebaseUser.displayName,
      email: firebaseUser.email,
      photoURL: firebaseUser.photoURL
    };
    localStorage.setItem('ecomiles_user', JSON.stringify(userData));
  }
  
  return true;
}

function logout() {
  auth.signOut().then(() => {
    localStorage.removeItem('ecomiles_user');
    window.location.href = 'index.html';
  }).catch(err => {
    console.error('Error signing out:', err);
  });
}

// Journey management functions for Firebase
async function saveJourney(journeyData) {
  const user = getCurrentUser();
  if (!user) return null;
  
  try {
    const journey = {
      ...journeyData,
      userId: user.uid,
      id: Date.now().toString(),
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    const docRef = await db.collection('journeys').add(journey);
    
    // Update user stats
    await updateUserStats(user.uid, journeyData.points, parseFloat(journeyData.distance));
    
    return { id: docRef.id, ...journey };
  } catch (error) {
    console.error('Error saving journey:', error);
    return null;
  }
}

async function getUserJourneys(userId, limit = 50) {
  try {
    const snapshot = await db.collection('journeys')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching journeys:', error);
    return [];
  }
}

async function updateUserStats(userId, points, distance) {
  try {
    const userRef = db.collection('users').doc(userId);
    await userRef.update({
      points: firebase.firestore.FieldValue.increment(points),
      totalDistance: firebase.firestore.FieldValue.increment(distance),
      roadTaxSaved: firebase.firestore.FieldValue.increment(distance * 0.15) // Estimated tax savings
    });
  } catch (error) {
    console.error('Error updating user stats:', error);
  }
}

// Vehicle management functions
async function getVehicles() {
  try {
    const snapshot = await db.collection('vehicles').get();
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    return [];
  }
}

async function getVehicleById(vehicleId) {
  try {
    const doc = await db.collection('vehicles').doc(vehicleId).get();
    if (doc.exists) {
      return { id: doc.id, ...doc.data() };
    }
    return null;
  } catch (error) {
    console.error('Error fetching vehicle:', error);
    return null;
  }
}

async function updateVehicleLocation(vehicleId, location) {
  try {
    await db.collection('vehicles').doc(vehicleId).update({
      currentLocation: location,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating vehicle location:', error);
  }
}

// Driver functions
async function createDriver(driverData) {
  try {
    const docRef = await db.collection('drivers').add({
      ...driverData,
      id: Date.now().toString(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...driverData };
  } catch (error) {
    console.error('Error creating driver:', error);
    return null;
  }
}

async function getDriverByUserId(userId) {
  try {
    const snapshot = await db.collection('drivers')
      .where('userId', '==', userId)
      .get();
    
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    }
    return null;
  } catch (error) {
    console.error('Error fetching driver:', error);
    return null;
  }
}

// Leaderboard functions - only shows users who opted in
async function getLeaderboard(limit = 10) {
  try {
    const snapshot = await db.collection('users')
      .where('showInLeaderboard', '==', true)
      .orderBy('points', 'desc')
      .limit(limit)
      .get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
}

// Update user privacy settings
async function updateUserPrivacy(userId, showInLeaderboard) {
  try {
    await db.collection('users').doc(userId).update({
      showInLeaderboard: showInLeaderboard
    });
    return true;
  } catch (error) {
    console.error('Error updating privacy settings:', error);
    return false;
  }
}
