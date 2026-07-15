import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc,
  addDoc, updateDoc, deleteDoc,
  onSnapshot, setDoc, getDoc, getDocs, serverTimestamp,
  query, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const fbConfig = {
  apiKey:            "AIzaSyAZCaUFsBdm_Eu38TcxYfKVfnP4fBlOClw",
  authDomain:        "katreseli.firebaseapp.com",
  projectId:         "katreseli",
  storageBucket:     "katreseli.firebasestorage.app",
  messagingSenderId: "70788726473",
  appId:             "1:70788726473:web:da67bdf6b9d4861fed1718"
};

const fbApp = initializeApp(fbConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

export {
  auth, db,
  collection, doc,
  addDoc, updateDoc, deleteDoc,
  onSnapshot, setDoc, getDoc, getDocs, serverTimestamp,
  query, where, orderBy
};
