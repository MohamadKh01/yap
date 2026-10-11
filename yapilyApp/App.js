import React, { useState, useEffect } from 'react';
import { View, Text, Button, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import axios from 'axios';

// IMPORTANT: Point this to your backend (use your ngrok URL or local IP if on the same Wi-Fi)
const BACKEND_URL = 'https://footer-skipping-dangle.ngrok-free.dev';

const Stack = createNativeStackNavigator();

// --- Screen 1: Institutions List ---
function InstitutionsScreen({ navigation }) {
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${BACKEND_URL}/institutions`)
      .then(res => {
        setInstitutions(res.data.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const handleSelect = async (institutionId) => {
    try {
      // Dynamically gets 'exp://...' in Expo Go, or 'dabi://...' in the APK
      const returnUrl = Linking.createURL('callback');

      const response = await axios.post(`${BACKEND_URL}/auth-request`, {
        institutionId: institutionId,
        returnUrl: returnUrl
      });

      const authUrl = response.data.data.authorisationUrl;
      await WebBrowser.openBrowserAsync(authUrl);
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) return <ActivityIndicator style={styles.center} size="large" />;

  return (
    <FlatList
      data={institutions}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.card} onPress={() => handleSelect(item.id)}>
          <Text style={styles.title}>{item.name}</Text>
        </TouchableOpacity>
      )}
    />
  );
}

// --- Screen 2: Accounts & Consent Data ---
function AccountsScreen({ route, navigation }) {
  const { consentToken, consentId } = route.params;
  const [accounts, setAccounts] = useState([]);
  const [consentData, setConsentData] = useState(null);

  useEffect(() => {
    // 1. Fetch Consent Metadata
    if (consentId) {
      axios.get(`${BACKEND_URL}/consents/${consentId}`)
        .then(res => setConsentData(res.data.data))
        .catch(console.error);
    }

    // 2. Fetch Accounts
    axios.get(`${BACKEND_URL}/accounts`, {
      headers: { consenttoken: consentToken }
    })
      .then(res => setAccounts(res.data.data))
      .catch(console.error);
  }, [consentToken, consentId]);

  return (
    <View style={{ flex: 1 }}>
      {consentData && (
        <View style={styles.consentBox}>
          <Text style={styles.subtitle}>Consent Details (Lease)</Text>
          <Text>Authorized At: {new Date(consentData.authorizedAt).toLocaleDateString()}</Text>
          <Text>Expires At: {new Date(consentData.expiresAt).toLocaleDateString()}</Text>
          <Text>Reconfirm By: {new Date(consentData.reconfirmBy).toLocaleDateString()}</Text>
        </View>
      )}
      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('Transactions', {
              accountId: item.id,
              consentToken
            })}
          >
            <Text style={styles.title}>{item.accountNames?.[0]?.name || 'Account'} - {item.currency}</Text>
            <Text>Balance: {item.balance}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

// --- Screen 3: Transaction History ---
function TransactionsScreen({ route }) {
  const { accountId, consentToken } = route.params;
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    axios.get(`${BACKEND_URL}/accounts/${accountId}/transactions`, {
      headers: { consenttoken: consentToken }
    })
      .then(res => setTransactions(res.data.data || []))
      .catch(console.error);
  }, []);

  return (
    <FlatList
      data={transactions}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.title}>{item.description || item.reference}</Text>
          <Text>{item.date} | {item.amount} {item.currency}</Text>
        </View>
      )}
    />
  );
}

// --- Main App & Deep Linking Configuration ---
export default function App() {
  const prefix = Linking.createURL('/');

  const linking = {
    prefixes: ['dabi://', prefix],
    config: {
      screens: {
        Home: '',
        // When backend redirects to dabi://callback, this maps the route
        Callback: 'callback',
        Accounts: 'accounts',
        Transactions: 'transactions',
      },
    },
  };

  return (
    <NavigationContainer linking={linking} fallback={<ActivityIndicator style={styles.center} />}>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={InstitutionsScreen} options={{ title: 'Select Bank' }} />
        <Stack.Screen name="Callback" component={CallbackScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Accounts" component={AccountsScreen} options={{ title: 'My Accounts' }} />
        <Stack.Screen name="Transactions" component={TransactionsScreen} options={{ title: 'Transactions' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function CallbackScreen({ route, navigation }) {
  useEffect(() => {
    // Close the Expo WebBrowser
    WebBrowser.dismissBrowser();
    
    // React Navigation automatically parses the URL query parameters into route.params
    const params = route.params || {};
    const token = params.consent || params['consent-token'];
    
    // Note: Yapily returns 'consentid' in lowercase in the query string
    const consentId = params.consentid || params['consent-id']; 

    if (token) {
      // Use replace so the user can't swipe back to the loading screen
      navigation.replace('Accounts', { 
        consentToken: token,
        consentId: consentId
      });
    } else {
      // Fallback if no token is found
      navigation.replace('Home');
    }
  }, [route.params, navigation]);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
      <Text style={{ marginTop: 10 }}>Verifying secure connection...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { padding: 20, margin: 10, backgroundColor: '#fff', borderRadius: 8, elevation: 2 },
  title: { fontSize: 16, fontWeight: 'bold', marginBottom: 5 },
  consentBox: { padding: 15, margin: 10, backgroundColor: '#e3f2fd', borderRadius: 8 },
  subtitle: { fontWeight: 'bold', marginBottom: 8 }
});