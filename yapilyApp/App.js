import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, StatusBar, RefreshControl, TextInput, Image, Keyboard, Platform } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { NavigationContainer, DarkTheme, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { auth } from './firebaseConfig';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

// IMPORTANT: Point this to your backend
const BACKEND_URL = 'https://yapily.onrender.com';

const Stack = createNativeStackNavigator();

// --- Theme Constants ---
const theme = {
  background: '#121212',
  surface: '#1E1E1E',
  primary: '#4DA8DA',
  text: '#FFFFFF',
  subText: '#A0A0A0',
  border: '#2C2C2C',
  consentBg: '#1A2B3C',
  danger: '#FF6B6B',
  success: '#51CF66'
};

// --- Empty State Component ---
const EmptyState = ({ message }) => (
  <View style={styles.emptyContainer}>
    <Text style={styles.emptyText}>{message}</Text>
  </View>
);

// --- Individual Account Card ---
const AccountCard = ({ item, onPress, isDiscreet }) => {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.rowBetween}>
        <Text style={styles.title}>{item.accountNames?.[0]?.name || 'Bank Account'}</Text>
      </View>

      <View style={[styles.rowBetween, { marginTop: 4 }]}>
        <Text style={styles.subText}>{item.currency}</Text>
        <View style={styles.balanceContainer}>
          <Text style={[
            styles.balanceText,
            !isDiscreet && { color: item.balance > 0 ? theme.success : item.balance < 0 ? theme.danger : theme.text }
          ]}>
            {isDiscreet ? '****' : `${item.balance} ${item.currency}`}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// --- Expandable Transaction Card Component ---
const TransactionCard = ({ item }) => {
  const [expanded, setExpanded] = useState(false);

  const isIncoming = item.amount > 0;
  const sign = isIncoming ? '+' : '';

  const dateObj = new Date(item.date);
  const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formattedTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  let rawDesc = item.description || item.merchant?.name || item.reference || 'Unknown';
  let method = 'Transfer';
  let displayName = rawDesc;

  const transferMatch = rawDesc.match(/^(.*?)\s+(to|from)\s+(.*)$/i);
  if (transferMatch) {
    method = transferMatch[1].charAt(0).toUpperCase() + transferMatch[1].slice(1).toLowerCase();
    displayName = transferMatch[3].trim();
  }

  if (displayName.includes(',')) {
    const parts = displayName.split(',');
    if (parts.length === 2) {
      displayName = `${parts[1].trim()} ${parts[0].trim()}`;
    }
  }

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => setExpanded(!expanded)}>
      <View style={styles.rowBetween}>
        <View style={styles.transactionLeft}>
          <Text style={styles.title} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.subText}>{formattedDate}</Text>
        </View>
        <View style={styles.transactionRight}>
          <Text style={[styles.balanceText, { color: isIncoming ? theme.success : theme.danger }]}>
            {sign}{item.amount} {item.currency}
          </Text>
        </View>
      </View>

      {expanded && (
        <View style={styles.expandedContent}>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Method:</Text>
            <Text style={styles.detailValue}>{method}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Time:</Text>
            <Text style={styles.detailValue}>{formattedTime}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Reference:</Text>
            <Text style={styles.detailValue}>{item.reference || 'N/A'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status:</Text>
            <Text style={styles.detailValue}>{item.status || 'Completed'}</Text>
          </View>
          {item.transactionId && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Txn ID:</Text>
              <Text style={styles.detailValue}>{item.transactionId}</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

// --- Authentication Screen ---
function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Refs for keyboard routing
  const passwordInputRef = useRef(null);

  const handleAuth = async () => {
    Keyboard.dismiss();
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setLoading(true);
    setError('');

    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''));
    } finally {
      setLoading(false);
    }
  };

  const toggleRegistering = () => {
    setIsRegistering(!isRegistering);
    setEmail('');
    setPassword('');
    setError('');
    Keyboard.dismiss();
  };

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={true}
      extraScrollHeight={20}
      bounces={false}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <View style={[styles.center, { flex: 0, paddingVertical: 40 }]}>
        <View style={styles.loginBox}>
          <View style={styles.logoPlaceholder}>
            <Ionicons name="cube" size={40} color={theme.primary} />
          </View>
          <Text style={styles.loginTitle}>MAuraK</Text>
          <Text style={styles.loginSubtitle}>{isRegistering ? 'Create your account' : 'Sign in to your vault'}</Text>

          {error ? <Text style={styles.loginError}>{error}</Text> : null}

          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor={theme.subText}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            returnKeyType="next"
            onSubmitEditing={() => passwordInputRef.current?.focus()}
            blurOnSubmit={false}
          />
          <TextInput
            ref={passwordInputRef}
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={theme.subText}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleAuth}
          />

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <Text style={styles.primaryButtonText}>{isRegistering ? 'Sign Up' : 'Sign In'}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={toggleRegistering} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.switchText}>
              {isRegistering ? "Already have an account? Sign In" : "Need an account? Sign Up"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAwareScrollView>
  );
}

// --- Screen 1: Institutions List (Grid Layout & Search) ---
function InstitutionsScreen({ navigation, user }) {
  const [institutions, setInstitutions] = useState([]);
  const [savedConsents, setSavedConsents] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [authLoadingId, setAuthLoadingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchInstitutions = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/institutions`);
      setInstitutions(res.data.data || []);
    } catch (err) {
      console.error("Error fetching institutions:", err);
    }
  };

  // Fetch tokens securely from the cloud instead of AsyncStorage
  const fetchUserTokens = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/user/tokens/${user.uid}`);
      const tokensArray = res.data.linkedBanks || [];

      const consentsMap = {};
      tokensArray.forEach(tokenObj => {
        consentsMap[tokenObj.institutionId] = {
          consentToken: tokenObj.consentToken,
          consentId: tokenObj.consentId // <-- Extract the ID from Firestore
        };
      });
      setSavedConsents(consentsMap);
    } catch (err) {
      console.error("Error fetching user tokens:", err);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchUserTokens();
      if (institutions.length === 0) {
        fetchInstitutions().finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }, [institutions.length])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchInstitutions();
    await fetchUserTokens();
    setRefreshing(false);
  }, []);

  const handleSelect = async (institutionId) => {
    try {
      if (savedConsents[institutionId]) {
        navigation.navigate('Accounts', {
          consentToken: savedConsents[institutionId].consentToken,
          consentId: savedConsents[institutionId].consentId, // <-- Pass the ID to AccountsScreen
          instId: institutionId
        });
        return;
      }

      setAuthLoadingId(institutionId);
      const baseUrl = Linking.createURL('callback');
      const returnUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'instId=' + institutionId;

      // Pass the Firebase user UID to the Express server
      const response = await axios.post(`${BACKEND_URL}/auth-request`, {
        institutionId: institutionId,
        returnUrl: returnUrl,
        userId: user.uid
      });

      const authUrl = response.data.data.authorisationUrl;
      setAuthLoadingId(null);
      await WebBrowser.openBrowserAsync(authUrl);
    } catch (error) {
      console.error("Auth Request Error:", error);
      setAuthLoadingId(null);
    }
  };

  const processedInstitutions = institutions
    .filter(inst => inst.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      const aLinked = !!savedConsents[a.id];
      const bLinked = !!savedConsents[b.id];
      if (aLinked && !bLinked) return -1;
      if (!aLinked && bLinked) return 1;
      return a.name.localeCompare(b.name);
    });

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.primary} />
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={theme.subText} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search institutions..."
          placeholderTextColor={theme.subText}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={18} color={theme.subText} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={processedInstitutions}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRowWrapper}
        contentContainerStyle={[styles.gridListPadding, processedInstitutions.length === 0 && { flex: 1 }]}
        ListEmptyComponent={<EmptyState message="No matching institutions found." />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        renderItem={({ item }) => {
          const isLinked = !!savedConsents[item.id];
          const isCurrentlyAuthorizing = authLoadingId === item.id;
          const logoUrl = item.media && item.media.length > 0 ? item.media[0].source : null;

          return (
            <TouchableOpacity
              style={[styles.gridCard, isLinked && styles.cardLinked]}
              onPress={() => handleSelect(item.id)}
              activeOpacity={0.7}
              disabled={authLoadingId !== null}
            >
              {isCurrentlyAuthorizing ? (
                <View style={styles.logoPlaceholder}>
                  <ActivityIndicator size="small" color={theme.primary} />
                </View>
              ) : logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.bankLogo} resizeMode="contain" />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Ionicons name="business" size={28} color={theme.subText} />
                </View>
              )}

              <Text style={styles.gridTitle} numberOfLines={2}>{item.name}</Text>

              {isLinked && (
                <View style={styles.linkedBadgeWrapper}>
                  <Ionicons name="checkmark-circle" size={14} color={theme.success} style={{ marginRight: 4 }} />
                  <Text style={styles.linkedBadgeGrid}>Linked</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

// --- Screen 2: Accounts & Consent Data ---
function AccountsScreen({ route, navigation }) {
  const { consentToken, consentId, instId } = route.params;
  const [accounts, setAccounts] = useState([]);
  const [consentData, setConsentData] = useState(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isDiscreet, setIsDiscreet] = useState(false);

  // Universal Discreet Toggle in Header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => setIsDiscreet(!isDiscreet)} style={{ padding: 8 }}>
          <Ionicons name={isDiscreet ? 'eye-off' : 'eye'} size={24} color={theme.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, isDiscreet]);

  const fetchConsentAndAccounts = async () => {
    try {
      if (consentId) {
        const consentRes = await axios.get(`${BACKEND_URL}/consents/${consentId}`);
        setConsentData(consentRes.data.data);
      }
      const accRes = await axios.get(`${BACKEND_URL}/accounts`, {
        headers: { consenttoken: consentToken }
      });
      setAccounts(accRes.data.data || []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchConsentAndAccounts().finally(() => setLoadingAccounts(false));
  }, [consentToken, consentId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchConsentAndAccounts();
    setRefreshing(false);
  }, []);

  const handleRevoke = async () => {
    try {
      if (instId) {
        const stored = await AsyncStorage.getItem('userConsents');
        if (stored) {
          const consents = JSON.parse(stored);
          delete consents[instId];
          await AsyncStorage.setItem('userConsents', JSON.stringify(consents));
        }
      }
      navigation.replace('Home');
    } catch (error) {
      console.error("Failed to revoke consent", error);
    }
  };

  if (loadingAccounts) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={[styles.subText, { marginTop: 10 }]}>Fetching accounts...</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {consentData && (
        <View style={styles.consentBox}>
          <View style={styles.rowBetween}>
            <Text style={styles.consentTitle}>Consent Active</Text>
            <TouchableOpacity onPress={handleRevoke} style={styles.revokeButton}>
              <Text style={styles.revokeText}>Revoke</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subText}>Authorized: {new Date(consentData.authorizedAt).toLocaleDateString()}</Text>
          <Text style={styles.subText}>Expires: {new Date(consentData.expiresAt).toLocaleDateString()}</Text>
        </View>
      )}
      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listPadding, accounts.length === 0 && { flex: 1 }]}
        ListEmptyComponent={<EmptyState message="No linked accounts found." />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        renderItem={({ item }) => (
          <AccountCard
            item={item}
            isDiscreet={isDiscreet}
            onPress={() => navigation.navigate('Transactions', {
              accountId: item.id,
              consentToken
            })}
          />
        )}
      />
    </View>
  );
}

// --- Screen 3: Transaction History ---
function TransactionsScreen({ route }) {
  const { accountId, consentToken } = route.params;
  const [transactions, setTransactions] = useState([]);
  const [loadingTxs, setLoadingTxs] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTransactions = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/accounts/${accountId}/transactions`, {
        headers: { consenttoken: consentToken }
      });
      setTransactions(res.data.data || []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchTransactions().finally(() => setLoadingTxs(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTransactions();
    setRefreshing(false);
  }, []);

  const filteredTransactions = transactions.filter(tx => {
    if (filter === 'incoming' && tx.amount <= 0) return false;
    if (filter === 'outgoing' && tx.amount >= 0) return false;

    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      const rawDesc = (tx.description || tx.merchant?.name || '').toLowerCase();
      const ref = (tx.reference || '').toLowerCase();

      if (!rawDesc.includes(query) && !ref.includes(query)) {
        return false;
      }
    }

    return true;
  });

  if (loadingTxs) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={[styles.subText, { marginTop: 10 }]}>Loading ledger...</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.filterContainer}>
        <TouchableOpacity style={[styles.filterTab, filter === 'all' && styles.filterTabActive]} onPress={() => setFilter('all')}>
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterTab, filter === 'incoming' && styles.filterTabActive]} onPress={() => setFilter('incoming')}>
          <Text style={[styles.filterText, filter === 'incoming' && styles.filterTextActive]}>Incoming</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterTab, filter === 'outgoing' && styles.filterTabActive]} onPress={() => setFilter('outgoing')}>
          <Text style={[styles.filterText, filter === 'outgoing' && styles.filterTextActive]}>Outgoing</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={theme.subText} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name or reference..."
          placeholderTextColor={theme.subText}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={18} color={theme.subText} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredTransactions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listPadding, filteredTransactions.length === 0 && { flex: 1 }]}
        ListEmptyComponent={<EmptyState message={searchQuery ? "No matching transfers found." : filter === 'all' ? "No recent transfers found." : `No ${filter} transfers found.`} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        renderItem={({ item }) => <TransactionCard item={item} />}
      />
    </View>
  );
}

// --- Callback Screen ---
function CallbackScreen({ route, navigation }) {
  useEffect(() => {
    WebBrowser.dismissBrowser();

    const processCallback = async () => {
      const params = route.params || {};
      const token = params.consent || params['consent-token'];
      const consentId = params.consentid || params['consent-id'];
      const instId = params.instId;

      if (token && instId) {
        try {
          const stored = await AsyncStorage.getItem('userConsents');
          const consents = stored ? JSON.parse(stored) : {};

          consents[instId] = { consentToken: token, consentId: consentId };
          await AsyncStorage.setItem('userConsents', JSON.stringify(consents));

          navigation.replace('Accounts', { consentToken: token, consentId: consentId, instId: instId });
        } catch (error) {
          console.error("Error saving consent", error);
          navigation.replace('Home');
        }
      } else {
        navigation.replace('Home');
      }
    };

    processCallback();
  }, [route.params, navigation]);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={[styles.subText, { marginTop: 15 }]}>Securing connection & saving link...</Text>
    </View>
  );
}

// --- Main App & Deep Linking Configuration ---
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return unsubscribe; // Cleanup listener on unmount
  }, []);

  const prefix = Linking.createURL('/');
  const linking = {
    prefixes: ['dabi://', prefix],
    config: { screens: { Home: '', Callback: 'callback', Accounts: 'accounts', Transactions: 'transactions' } },
  };

  if (authLoading) {
    return <ActivityIndicator style={styles.center} color={theme.primary} size="large" />;
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />
      <NavigationContainer linking={linking} theme={DarkTheme}>
        <Stack.Navigator screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerShadowVisible: false,
        }}>
          {user ? (
            // User is signed in
            <>
              <Stack.Screen
                name="Home"
                options={{
                  title: 'Select Bank',
                  headerRight: () => (
                    <TouchableOpacity onPress={() => signOut(auth)} style={{ padding: 8 }}>
                      <Ionicons name="log-out-outline" size={24} color={theme.danger} />
                    </TouchableOpacity>
                  )
                }}
              >
                {(props) => <InstitutionsScreen user={user} {...props} />}
              </Stack.Screen>
              <Stack.Screen name="Callback" component={CallbackScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Accounts" component={AccountsScreen} options={{ title: 'My Accounts' }} />
              <Stack.Screen name="Transactions" component={TransactionsScreen} options={{ title: 'Transactions' }} />
            </>
          ) : (
            // User is NOT signed in
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background },
  listPadding: { padding: 16 },

  card: { padding: 16, marginBottom: 12, backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border },

  gridListPadding: { paddingHorizontal: 8, paddingBottom: 16, paddingTop: 4 },
  gridRowWrapper: { justifyContent: 'space-between', paddingHorizontal: 8 },
  gridCard: {
    flex: 1,
    marginHorizontal: 8,
    marginTop: 12,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 140,
    maxWidth: '46%'
  },
  bankLogo: { width: 56, height: 56, marginBottom: 12, borderRadius: 8, backgroundColor: '#FFFFFF' },
  logoPlaceholder: { width: 56, height: 56, marginBottom: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, borderRadius: 8 },
  gridTitle: { fontSize: 13, fontWeight: '600', color: theme.text, textAlign: 'center', marginBottom: 8 },
  linkedBadgeWrapper: { flexDirection: 'row', alignItems: 'center', marginTop: 'auto' },
  linkedBadgeGrid: { color: theme.success, fontSize: 12, fontWeight: 'bold' },

  cardLinked: { borderColor: theme.success },
  title: { fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 4 },
  subText: { fontSize: 13, color: theme.subText },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceContainer: { flexDirection: 'row', alignItems: 'center' },
  balanceText: { fontSize: 16, fontWeight: '700', color: theme.text },

  consentBox: { padding: 16, margin: 16, backgroundColor: theme.consentBg, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: theme.primary },
  consentTitle: { fontWeight: '700', fontSize: 15, color: theme.primary, marginBottom: 8 },
  revokeButton: { backgroundColor: theme.danger + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: theme.danger },
  revokeText: { color: theme.danger, fontSize: 12, fontWeight: 'bold' },

  transactionLeft: { flex: 1, paddingRight: 12 },
  transactionRight: { alignItems: 'flex-end' },
  expandedContent: { marginTop: 12 },
  divider: { height: 1, backgroundColor: theme.border, marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  detailLabel: { fontSize: 13, color: theme.subText },
  detailValue: { fontSize: 13, color: theme.text, flex: 1, textAlign: 'right', marginLeft: 16 },

  filterContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, justifyContent: 'space-between', backgroundColor: theme.background, borderBottomWidth: 1, borderBottomColor: theme.border },
  filterTab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  filterTabActive: { borderBottomColor: theme.primary },
  filterText: { fontSize: 14, fontWeight: '600', color: theme.subText },
  filterTextActive: { color: theme.primary },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    height: 40,
  },
  searchInput: {
    flex: 1,
    color: theme.text,
    fontSize: 14,
    paddingVertical: 0,
  },
  searchIcon: {
    marginRight: 8,
  },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
  emptyText: { fontSize: 15, color: theme.subText, fontStyle: 'italic', textAlign: 'center', marginHorizontal: 32 },

  // Auth Styles
  loginBox: { width: '85%', backgroundColor: theme.surface, padding: 24, borderRadius: 16, borderWidth: 1, borderColor: theme.border, alignItems: 'center' },
  loginTitle: { fontSize: 24, fontWeight: '700', color: theme.text, marginBottom: 4 },
  loginSubtitle: { fontSize: 14, color: theme.subText, marginBottom: 24 },
  loginError: { color: theme.danger, fontSize: 12, marginBottom: 12, textAlign: 'center' },
  input: { width: '100%', backgroundColor: theme.background, color: theme.text, borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: theme.border },
  primaryButton: { width: '100%', backgroundColor: theme.primary, padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { color: theme.background, fontWeight: 'bold', fontSize: 15 },
  switchText: { color: theme.primary, fontSize: 13, marginTop: 20, fontWeight: '600' }
});