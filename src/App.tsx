/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  MapPin, 
  Clock, 
  Star, 
  Navigation, 
  ArrowRight, 
  ChevronRight, 
  Loader2, 
  Utensils,
  Map as MapIcon,
  Info,
  X,
  Calculator,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { AppState, Restaurant } from './types';

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [state, setState] = useState<AppState>('landing');
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState<string | null>("Binus Alam Sutera");
  const [coords, setCoords] = useState<{latitude: number, longitude: number} | null>({
    latitude: -6.2233,
    longitude: 106.6491
  });
  const [currentTime, setCurrentTime] = useState('');
  const [recommendation, setRecommendation] = useState<Restaurant | null>(null);
  const [alternatives, setAlternatives] = useState<Restaurant[]>([]);
  const [isError, setIsError] = useState(false);
  const [showCalculation, setShowCalculation] = useState(false);

  // Refined SAW Weights for Thesis
  const WEIGHTS = {
    C1: 0.20, // Distance (Reduced to prevent "bullying")
    C2: 0.30, // Food Type Match
    C3: 0.35, // Rating (Increased to prioritize quality)
    C4: 0.15  // Price Level
  };

  useEffect(() => {
    // Set current time
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 60000);

    // Get location (overriding with Binus Alam Sutera for this demo)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // We'll keep the Binus location as default but allow real GPS if available
          setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          setLocation("Nearby");
        },
        () => {
          // Fallback to Binus Alam Sutera if GPS denied
          setCoords({ latitude: -6.2233, longitude: 106.6491 });
          setLocation("Binus Alam Sutera");
        }
      );
    }

    return () => clearInterval(timer);
  }, []);

  const calculateSAW = (restaurants: Restaurant[], targetFoodType: string): Restaurant[] => {
    // 1. Find min/max for normalization
    const minDistance = Math.min(...restaurants.map(r => r.distanceValue));
    const maxRating = Math.max(...restaurants.map(r => r.rating));
    const minPrice = Math.min(...restaurants.map(r => r.priceValue));

    // 2. Normalize and Score
    const scored = restaurants.map(r => {
      // C1: Distance (Cost) -> Radius of Indifference (1.0 km)
      // If within 1km, score is 1.0. Otherwise, normalize relative to min.
      const r1 = r.distanceValue <= 1.0 ? 1.0 : minDistance / r.distanceValue;
      
      // C2: Food Type Match (Benefit)
      // If AI detects "general" query, everyone gets 1.0 match score
      const r2 = targetFoodType === 'general' ? 1.0 : (
        r.foodType.toLowerCase().includes(targetFoodType.toLowerCase()) || 
        r.name.toLowerCase().includes(targetFoodType.toLowerCase()) ? 1 : 0
      );
      
      // C3: Rating (Benefit) -> x / max
      const r3 = r.rating / maxRating;
      
      // C4: Price Level (Cost) -> min / x
      const r4 = minPrice / r.priceValue;

      const totalScore = (r1 * WEIGHTS.C1) + (r2 * WEIGHTS.C2) + (r3 * WEIGHTS.C3) + (r4 * WEIGHTS.C4);

      return {
        ...r,
        sawScore: Number(totalScore.toFixed(4)),
        criteriaScores: {
          c1: Number(r1.toFixed(4)),
          c2: r2,
          c3: Number(r3.toFixed(4)),
          c4: Number(r4.toFixed(4))
        }
      };
    });

    // 3. Rank by score
    return scored.sort((a, b) => (b.sawScore || 0) - (a.sawScore || 0));
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setState('processing');
    setIsError(false);

    // 1. NLP Phase: Extract context using AI
    let targetFoodType = query.toLowerCase();
    try {
      const nlpPrompt = `Extract the specific food type or cuisine from this user request: "${query}". 
      Return only the single most relevant keyword (e.g., "nasi", "bakmi", "burger", "sate"). 
      If no specific food is mentioned, return "general".`;
      
      const nlpResult = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: nlpPrompt }] }],
      });
      targetFoodType = nlpResult.text.trim().toLowerCase();
    } catch (err) {
      console.warn("NLP extraction failed, using raw query");
    }

    // 2. Data Retrieval Phase (Alam Sutera Candidate Pool)
    const candidatePool: Restaurant[] = [
      {
        id: '1',
        name: 'Sate Khas Senayan',
        rating: 4.5,
        priceLevel: '$$$',
        priceValue: 3,
        distance: '0.8 km',
        distanceValue: 0.8,
        status: 'Open',
        address: 'Flavor Bliss, Alam Sutera',
        description: 'Authentic Indonesian satay and traditional dishes in a comfortable setting.',
        imageUrl: 'https://picsum.photos/seed/sate/800/400',
        foodType: 'sate',
        coordinates: { lat: -6.2251, lng: 106.6525 }
      },
      {
        id: '2',
        name: 'IKEA Restaurant',
        rating: 4.6,
        priceLevel: '$$',
        priceValue: 2,
        distance: '1.2 km',
        distanceValue: 1.2,
        status: 'Open',
        address: 'IKEA Alam Sutera',
        description: 'Famous Swedish meatballs and various western-style dishes.',
        imageUrl: 'https://picsum.photos/seed/ikea/400/300',
        foodType: 'western',
        coordinates: { lat: -6.2225, lng: 106.6625 }
      },
      {
        id: '3',
        name: 'Bakmi GM',
        rating: 4.4,
        priceLevel: '$$',
        priceValue: 2,
        distance: '0.5 km',
        distanceValue: 0.5,
        status: 'Open',
        address: 'Living World Mall, Alam Sutera',
        description: 'Legendary Indonesian noodle chain famous for its fried wontons.',
        imageUrl: 'https://picsum.photos/seed/bakmi/400/300',
        foodType: 'bakmi',
        coordinates: { lat: -6.2245, lng: 106.6505 }
      },
      {
        id: '4',
        name: 'Nasi Kapau Merdeka',
        rating: 4.7,
        priceLevel: '$$',
        priceValue: 2,
        distance: '0.9 km',
        distanceValue: 0.9,
        status: 'Open',
        address: 'Flavor Bliss, Alam Sutera',
        description: 'Authentic Minang cuisine with a wide variety of flavorful dishes.',
        imageUrl: 'https://picsum.photos/seed/padang/400/300',
        foodType: 'nasi',
        coordinates: { lat: -6.2255, lng: 106.6535 }
      },
      {
        id: '5',
        name: 'The Garden',
        rating: 4.3,
        priceLevel: '$$$',
        priceValue: 3,
        distance: '0.6 km',
        distanceValue: 0.6,
        status: 'Open',
        address: 'Living World Mall, Alam Sutera',
        description: 'Beautiful garden-themed restaurant serving fusion and western food.',
        imageUrl: 'https://picsum.photos/seed/garden/400/300',
        foodType: 'fusion',
        coordinates: { lat: -6.2248, lng: 106.6508 }
      },
      {
        id: '6',
        name: 'Pagi Sore',
        rating: 4.8,
        priceLevel: '$$$',
        priceValue: 3,
        distance: '1.5 km',
        distanceValue: 1.5,
        status: 'Open',
        address: 'Jl. Alam Sutera Boulevard',
        description: 'Premium Padang restaurant known for its exceptional Rendang.',
        imageUrl: 'https://picsum.photos/seed/pagisore/400/300',
        foodType: 'nasi',
        coordinates: { lat: -6.2185, lng: 106.6555 }
      }
    ];

    // 3. SAW Algorithm Phase
    const rankedResults = calculateSAW(candidatePool, targetFoodType);

    setTimeout(() => {
      setRecommendation(rankedResults[0]);
      setAlternatives(rankedResults.slice(1));
      setState('results');
    }, 1500);
  };


  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-[#F9F9F8] relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-emerald-100/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-5%] left-[-5%] w-72 h-72 bg-orange-100/20 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="px-6 pt-8 pb-4 flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-sm">
            <Utensils size={18} />
          </div>
          <span className="font-bold text-lg tracking-tight">DineDecide</span>
        </div>
        <div className="flex flex-col items-end text-[10px] font-medium uppercase tracking-widest text-neutral-400">
          <div className="flex items-center gap-1">
            <MapPin size={10} />
            <span>{location || "Detecting..."}</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <Clock size={10} />
            <span>{currentTime}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col px-6 pb-8 z-10">
        <AnimatePresence mode="wait">
          {state === 'landing' && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex flex-col justify-center"
            >
              <h1 className="text-4xl font-bold tracking-tight mb-4 leading-tight">
                Where should we <br />
                <span className="text-emerald-600 italic serif">eat today?</span>
              </h1>
              <p className="text-neutral-500 mb-8 text-sm max-w-[280px]">
                Tell me what you're craving. I'll handle the decision fatigue.
              </p>

              <form onSubmit={handleSearch} className="relative">
                <input 
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. ramen nearby not too expensive"
                  className="w-full bg-white border border-neutral-200 rounded-2xl py-5 pl-6 pr-14 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                />
                <button 
                  type="submit"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-md hover:bg-emerald-700 transition-colors"
                >
                  <ArrowRight size={20} />
                </button>
              </form>

              <div className="mt-8 flex flex-wrap gap-2">
                {['Quick lunch', 'Date night', 'Cheap eats', 'Group friendly'].map((tag) => (
                  <button 
                    key={tag}
                    onClick={() => setQuery(tag.toLowerCase())}
                    className="px-4 py-2 bg-white border border-neutral-200 rounded-full text-xs font-medium text-neutral-600 hover:border-emerald-500 hover:text-emerald-600 transition-all"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {state === 'processing' && (
            <motion.div 
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center text-center"
            >
              <div className="relative mb-8">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-20 h-20 border-4 border-emerald-100 border-t-emerald-600 rounded-full"
                />
                <div className="absolute inset-0 flex items-center justify-center text-emerald-600">
                  <Search size={24} />
                </div>
              </div>
              <h2 className="text-xl font-semibold mb-2">Finding the perfect spot...</h2>
              <div className="flex flex-col gap-2 text-sm text-neutral-400">
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >Checking distance and ratings</motion.p>
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                >Matching your vibe</motion.p>
              </div>
            </motion.div>
          )}

          {state === 'results' && recommendation && (
            <motion.div 
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <button 
                  onClick={() => setState('landing')}
                  className="text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  <X size={24} />
                </button>
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-600">Top Pick</span>
                <div className="w-6" /> {/* Spacer */}
              </div>

              {/* Main Recommendation Card */}
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-white rounded-3xl overflow-hidden card-shadow mb-8"
              >
                <div className="relative h-48">
                  <img 
                    src={recommendation.imageUrl} 
                    alt={recommendation.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm">
                    {recommendation.status}
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-2xl font-bold tracking-tight">{recommendation.name}</h3>
                    <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg text-xs font-bold">
                      <Star size={12} fill="currentColor" />
                      {recommendation.rating}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-neutral-500 mb-4">
                    <div className="flex items-center gap-1">
                      <Navigation size={14} />
                      {recommendation.distance}
                    </div>
                    <div className="font-mono text-neutral-400">{recommendation.priceLevel}</div>
                    <div className="ml-auto flex items-center gap-1.5 bg-orange-50 text-orange-700 px-3 py-1 rounded-full text-[10px] font-bold border border-orange-100">
                      <Calculator size={10} />
                      SAW: {recommendation.sawScore}
                    </div>
                  </div>

                  <p className="text-neutral-600 text-sm leading-relaxed mb-6">
                    {recommendation.description}
                  </p>

                  {/* SAW Calculation Breakdown */}
                  <div className="mb-6 border-t border-neutral-100 pt-4">
                    <button 
                      onClick={() => setShowCalculation(!showCalculation)}
                      className="flex items-center justify-between w-full text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-emerald-600 transition-colors"
                    >
                      <span>Decision Logic (SAW)</span>
                      {showCalculation ? <ChevronUp size={14} /> : <ChevronDown size={14} /> }
                    </button>
                    
                    <AnimatePresence>
                      {showCalculation && recommendation.criteriaScores && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden mt-3 space-y-2"
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-neutral-50 p-2 rounded-lg">
                              <div className="text-[8px] text-neutral-400 uppercase font-bold">C1: Distance (20%)</div>
                              <div className="text-xs font-mono font-bold">{(recommendation.criteriaScores.c1 * WEIGHTS.C1).toFixed(4)}</div>
                            </div>
                            <div className="bg-neutral-50 p-2 rounded-lg">
                              <div className="text-[8px] text-neutral-400 uppercase font-bold">C2: Match (30%)</div>
                              <div className="text-xs font-mono font-bold">{(recommendation.criteriaScores.c2 * WEIGHTS.C2).toFixed(4)}</div>
                            </div>
                            <div className="bg-neutral-50 p-2 rounded-lg">
                              <div className="text-[8px] text-neutral-400 uppercase font-bold">C3: Rating (35%)</div>
                              <div className="text-xs font-mono font-bold">{(recommendation.criteriaScores.c3 * WEIGHTS.C3).toFixed(4)}</div>
                            </div>
                            <div className="bg-neutral-50 p-2 rounded-lg">
                              <div className="text-[8px] text-neutral-400 uppercase font-bold">C4: Price (15%)</div>
                              <div className="text-xs font-mono font-bold">{(recommendation.criteriaScores.c4 * WEIGHTS.C4).toFixed(4)}</div>
                            </div>
                          </div>
                          <div className="text-[9px] text-neutral-400 italic">
                            * Normalized using SAW Multi-Criteria method.
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex gap-3">
                    <button className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-bold text-sm shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                      Let's go here
                      <ArrowRight size={16} />
                    </button>
                    <button className="w-14 h-14 bg-neutral-100 text-neutral-600 rounded-2xl flex items-center justify-center hover:bg-neutral-200 transition-all">
                      <MapIcon size={20} />
                    </button>
                  </div>
                </div>
              </motion.div>

              {/* Alternatives */}
              <div className="mb-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-4">Other Options</h4>
                <div className="space-y-3">
                  {alternatives.map((alt, idx) => (
                    <motion.div 
                      key={alt.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="bg-white p-4 rounded-2xl border border-neutral-100 flex items-center gap-4 hover:border-emerald-500/30 cursor-pointer transition-all group"
                    >
                      <img 
                        src={alt.imageUrl} 
                        alt={alt.name}
                        className="w-16 h-16 rounded-xl object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <h5 className="font-bold text-sm group-hover:text-emerald-600 transition-colors">{alt.name}</h5>
                          <span className="text-[9px] font-mono font-bold text-orange-600 bg-orange-50 px-1.5 rounded">SAW: {alt.sawScore}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-medium text-neutral-400 mt-1 uppercase tracking-wider">
                          <span className="flex items-center gap-0.5"><Star size={10} fill="currentColor" className="text-emerald-500" /> {alt.rating}</span>
                          <span>{alt.distance}</span>
                          <span className="font-mono">{alt.priceLevel}</span>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-neutral-300 group-hover:text-emerald-500 transition-colors" />
                    </motion.div>
                  ))}
                </div>
              </div>
              
              <button 
                onClick={() => setState('landing')}
                className="mt-4 text-center text-xs font-medium text-neutral-400 hover:text-emerald-600 transition-colors"
              >
                Try a different search
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Info */}
      <footer className="px-6 py-4 flex justify-center items-center gap-2 text-[10px] text-neutral-400 font-medium">
        <Info size={12} />
      </footer>
    </div>
  );
}

