"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Head from 'next/head';

const SUPABASE_URL = "https://ntlxfdwpldcnsklmddzd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bHhmZHdwbGRjbnNrbG1kZHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjkyNTEsImV4cCI6MjA5NjUwNTI1MX0.TDwHNCITp08CXHmxyvO2haDgPMNbAXetFDwViATuJkI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 🛠️ [신규] 브라우저 자체 엔진을 활용한 이미지 자동 압축 함수
const compressImage = (file: File): Promise<File> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200; // 가로 최대 1200px (이상이면 자동 축소)
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0, width, height);

        // PNG는 투명도 유지를 위해 PNG 유지, 나머지는 JPEG로 변환하여 용량 극대화
        const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: outType, lastModified: Date.now() }));
          } else {
            resolve(file); // 압축 실패 시 안전하게 원본 파일 반환
          }
        }, outType, 0.8); // 80% 화질 유지 (육안으로 차이 없으나 용량은 대폭 감소)
      };
      img.onerror = () => resolve(file); // 파일 손상 시 통과
    };
    reader.onerror = () => resolve(file);
  });
};

export default function Home() {
  const [currentView, setCurrentView] = useState("로비");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [focusPostId, setFocusPostId] = useState<number | null>(null);
  const [writingCategory, setWritingCategory] = useState("");
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [selectedTargetUser, setSelectedTargetUser] = useState<string>(""); 

  const [currentPage, setCurrentPage] = useState(1);  
  const [myPageTab, setMyPageTab] = useState(0);
  const [selectedSub, setSelectedSub] = useState("전체");
  const [sortOption, setSortOption] = useState("최신순");

  const [auth, setAuth] = useState({ loggedIn: false, userId: "", userRole: "guest" });

  const CATEGORIES = ["옷", "음식", "여가", "쇼핑", "여행", "핫딜 커뮤니티", "공지사항", "요청"];

  const [subCategories, setSubCategories] = useState<any>({
    "옷": ["전체", "상의", "하의", "아우터", "종료"], 
    "음식": ["전체", "버거킹", "파리바게뜨", "스타벅스", "기타맛집", "종료"],
    "여가": ["전체", "영화", "PC방", "운동", "종료"], 
    "쇼핑": ["전체", "전자기기", "생필품", "종료"], 
    "여행": ["전체", "국내여행", "해외여행", "종료"],
    "핫딜 커뮤니티": ["전체", "자유잡담", "할인제보", "종료"], 
    "공지사항": ["전체", "필독", "이벤트"], 
    "요청": ["전체", "사이트요청", "브랜드요청", "기타요청"] 
  });

  const [viewedPosts, setViewedPosts] = useState<any>({});
  const [notifications, setNotifications] = useState<any>({});
  const [toast, setToast] = useState({ show: false, message: "" });
  
  const [profilesDb, setProfilesDb] = useState<any>({});
  const [userProfile, setUserProfile] = useState({ nickname: "", sharePosts: false, shareComments: false });
  
  const [mainBanner, setMainBanner] = useState({
    imageUrl: "https://dummyimage.com/1600x400/1e293b/ffffff&text=[Grand+Open]+Welcome+to+HALINMOA!",
    targetLink: "https://naver.com",
    isActive: true
  });

  const [posts, setPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);

  const fetchTargetData = async () => {
    setIsLoading(true);
    try {
      const { data: profilesRes } = await supabase.from('profiles').select('*');
      if (profilesRes) {
        const pMap: any = {};
        profilesRes.forEach((p: any) => pMap[p.user_id] = p);
        setProfilesDb(pMap);
        if (auth.userId) {
          setUserProfile({
            nickname: pMap[auth.userId]?.nickname || auth.userId,
            sharePosts: pMap[auth.userId]?.share_posts ?? false,
            shareComments: pMap[auth.userId]?.share_comments ?? false
          });
        }
      }

      let query = supabase.from('deals').select('*', { count: 'exact' });

      if (CATEGORIES.includes(currentView) && !focusPostId) {
        query = query.eq('category', currentView);
        const isClosable = !["공지사항", "요청"].includes(currentView);
        const todayStr = new Date().toISOString().split('T')[0];

        if (isClosable) {
          if (selectedSub === "종료") {
            query = query.or(`status.eq.종료,end_date.lt.${todayStr}`);
          } else {
            query = query.neq('status', '종료').or(`end_date.gte.${todayStr},end_date.is.null`);
            if (selectedSub !== "전체") query = query.eq('sub_category', selectedSub);
          }
        } else {
          if (selectedSub !== "전체") query = query.eq('sub_category', selectedSub);
        }

        if (activeSearch) {
          query = query.or(`title.ilike.%${activeSearch}%,content.ilike.%${activeSearch}%`);
        }

        if (sortOption === "조회순") {
          query = query.order('views', { ascending: false });
        } else if (sortOption === "추천순") {
          query = query.order('upvotes', { ascending: false });
        } else {
          query = query.order('id', { ascending: false });
        }

        const from = (currentPage - 1) * 8;
        const to = from + 8 - 1;
        query = query.range(from, to);

      } else if (focusPostId) {
        query = query.eq('id', focusPostId - 10000);
      } else {
        query = query.order('id', { ascending: false }).limit(200);
      }

      const { data, count } = await query;

      if (data) {
        const mappedPosts = data.map((item: any) => ({
          id: item.id + 10000, 
          author: item.author || "익명회원", 
          category: item.category || "핫딜 커뮤니티", 
          subCategory: item.sub_category || "할인제보",
          title: item.title || "제목 없음", 
          content: item.content || "내용 없음", 
          link: item.url || item.link || "",
          image: item.image || null, 
          images: item.images || [], 
          views: item.views || 0, 
          upvotes: item.upvotes || 0, 
          upvotedBy: item.upvoted_by || [],
          thermoVotes: item.thermo_votes || { hot: 0, soso: 0, cold: 0 }, 
          thermoVotedBy: item.thermo_voted_by || {},
          reportedBy: item.reported_by || [], 
          scrappedBy: item.scrapped_by || [],
          time: item.created_at ? new Date(item.created_at).toISOString().replace('T', ' ').slice(0, 16) : new Date().toISOString().slice(0, 16).replace('T', ' '),
          endDate: item.end_date || null, 
          status: item.status || "진행중", 
          comments: item.comments || [],
          mallName: item.mall_name || "", 
          price: item.price || "", 
          shipping: item.shipping || ""
        }));
        
        setPosts(mappedPosts);
        
        if (CATEGORIES.includes(currentView) && !focusPostId && count !== null) {
          setTotalPages(Math.ceil(count / 8) || 1);
        }

        setTimeout(() => {
          if (typeof window !== "undefined" && !focusPostId) {
            const urlParams = new URLSearchParams(window.location.search);
            const postIdFromUrl = urlParams.get('post');
            if (postIdFromUrl && currentView === "로비") {
              const targetPostId = parseInt(postIdFromUrl, 10);
              setFocusPostId(targetPostId);
              setCurrentView("핫딜 커뮤니티"); 
            }
          }
        }, 50);
      }
    } catch (e) { 
      console.warn("데이터 로드 오류"); 
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTargetData();
  }, [currentView, selectedSub, sortOption, activeSearch, currentPage, focusPostId, auth.userId]);

  useEffect(() => {
    if (typeof window !== "undefined" && !window.history.state) {
      window.history.replaceState({ view: "로비" }, '', window.location.pathname + window.location.search);
    }

    const handlePopState = (event: any) => {
      const state = event.state;
      const urlParams = new URLSearchParams(window.location.search);
      const postIdFromUrl = urlParams.get('post');

      if (postIdFromUrl) {
        setFocusPostId(parseInt(postIdFromUrl, 10));
        if (state && state.view) setCurrentView(state.view);
      } else {
        setFocusPostId(null);
        if (state && state.view) {
          setCurrentView(state.view);
        } else {
          setCurrentView("로비");
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const syncUpdateToDB = async (postId: number, updateFields: any) => {
    if (postId < 10000) return; 
    const dbId = postId - 10000; 

    const dbFields: any = {};
    if (updateFields.views !== undefined) dbFields.views = updateFields.views;
    if (updateFields.upvotes !== undefined) dbFields.upvotes = updateFields.upvotes;
    if (updateFields.upvotedBy !== undefined) dbFields.upvoted_by = updateFields.upvotedBy;
    if (updateFields.thermoVotes !== undefined) dbFields.thermo_votes = updateFields.thermoVotes;
    if (updateFields.thermoVotedBy !== undefined) dbFields.thermo_voted_by = updateFields.thermoVotedBy;
    if (updateFields.scrappedBy !== undefined) dbFields.scrapped_by = updateFields.scrappedBy;
    if (updateFields.reportedBy !== undefined) dbFields.reported_by = updateFields.reportedBy;
    if (updateFields.comments !== undefined) dbFields.comments = updateFields.comments;

    const { error } = await supabase.from('deals').update(dbFields).eq('id', dbId);
  };

  const handleSocialLogin = async (provider: string) => {
    const actualProvider = provider === 'naver' ? 'custom:naver' : provider;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: actualProvider as any,
      options: { redirectTo: window.location.origin }
    });
    if (error) alert("소셜 로그인 연결 실패: " + error.message);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user) {
        const uid = session.user.email ? session.user.email.split('@')[0] : "user_" + session.user.id.substring(0, 5);
        setAuth({ loggedIn: true, userId: uid, userRole: uid === "ext9999" ? "admin" : "user" });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && session.user) {
        const uid = session.user.email ? session.user.email.split('@')[0] : "user_" + session.user.id.substring(0, 5);
        setAuth({ loggedIn: true, userId: uid, userRole: uid === "ext9999" ? "admin" : "user" });
      } else {
        setAuth({ loggedIn: false, userId: "", userRole: "guest" });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!auth.loggedIn || !auth.userId) return;

    const fetchNotis = async () => {
      const { data } = await supabase.from('notifications').select('*').eq('target_user', auth.userId).order('id', { ascending: false });
      if (data) setNotifications((prev: any) => ({ ...prev, [auth.userId]: data }));
    };
    fetchNotis();

    const notiChannel = supabase
      .channel('public:notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `target_user=eq.${auth.userId}` }, (payload) => {
        const newNoti = payload.new;
        setNotifications((prev: any) => ({ ...prev, [auth.userId]: [newNoti, ...(prev[auth.userId] || [])] }));
        setToast({ show: true, message: newNoti.text });
        setTimeout(() => setToast({ show: false, message: "" }), 4000);
      })
      .subscribe();

    return () => { supabase.removeChannel(notiChannel); };
  }, [auth.loggedIn, auth.userId]);

  const [loginEmail, setLoginEmail] = useState(""); const [loginPw, setLoginPw] = useState("");
  const [regEmail, setRegEmail] = useState(""); const [regPw, setRegPw] = useState(""); const [regPwChk, setRegPwChk] = useState("");
  const [findEmail, setFindEmail] = useState("");
  
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [showRegPw, setShowRegPw] = useState(false);
  const [showRegPwChk, setShowRegPwChk] = useState(false);

  const [writeSubCat, setWriteSubCat] = useState("일반"); const [writeMall, setWriteMall] = useState(""); const [writePrice, setWritePrice] = useState(""); const [writeShipping, setWriteShipping] = useState("무료배송"); const [writeTitle, setWriteTitle] = useState(""); const [writeContent, setWriteContent] = useState(""); const [writeLink, setWriteLink] = useState(""); 
  
  const [writeImages, setWriteImages] = useState<string[]>([]); 
  const [writeFiles, setWriteFiles] = useState<File[]>([]); 
  const [isUploading, setIsUploading] = useState(false); 

  const [writeEndDate, setWriteEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [isNoLimit, setIsNoLimit] = useState(false); 
  
  const [commentInput, setCommentInput] = useState(""); const [replyInputs, setReplyInputs] = useState<any>({}); const [replyOpen, setReplyOpen] = useState<any>({});
  
  const [adminBannerImg, setAdminBannerImg] = useState(mainBanner.imageUrl); 
  const [adminBannerLink, setAdminBannerLink] = useState(mainBanner.targetLink); 
  const [adminBannerActive, setAdminBannerActive] = useState(mainBanner.isActive);
  const [bannerFile, setBannerFile] = useState<File | null>(null); 
  
  const [adminEditCat, setAdminEditCat] = useState("옷"); const [adminAddSubInput, setAdminAddSubInput] = useState(""); const [adminRenameTarget, setAdminRenameTarget] = useState("선택안함"); const [adminRenameInput, setAdminRenameInput] = useState(""); const [adminDelTarget, setAdminDelTarget] = useState("선택안함");
  
  const navigate = (view: string) => { 
    setCurrentView(view); setFocusPostId(null); setActiveSearch(""); setSearchQuery(""); setSelectedSub("전체"); setCurrentPage(1); window.scrollTo(0,0); 
    
    if (typeof window !== "undefined") {
      window.history.pushState({ view: view }, '', '/'); 
    }

    if (view === "글쓰기") { 
      setWriteImages([]); setWriteFiles([]); setWriteTitle(""); setWriteContent(""); 
      setIsNoLimit(false); 
    }
  };
  
  const handleViewPost = (postId: number, cat: string) => {
    const now = Date.now();
    const postKey = `post_${postId}`;
    if (!viewedPosts[postKey] || (now - viewedPosts[postKey]) / 1000 > 60) {
      setPosts((prev: any[]) => prev.map(p => {
        if (p.id === postId) {
          const newViews = p.views + 1;
          syncUpdateToDB(postId, { views: newViews }); 
          return { ...p, views: newViews };
        }
        return p;
      }));
      setViewedPosts((prev: any) => ({ ...prev, [postKey]: now }));
    }
    setFocusPostId(postId); setCurrentView(cat);
    
    if (typeof window !== "undefined") {
      window.history.pushState({ view: cat }, '', `?post=${postId}`);
    }
    window.scrollTo(0,0);
  };

  const handleAuthorClick = (authorId: string) => {
    setSelectedTargetUser(authorId); setCurrentView("작성자 조회"); setFocusPostId(null); window.scrollTo(0,0);
  };

  const addNotify = async (targetUser: string, text: string, postId: number) => {
    const timeStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
    await supabase.from('notifications').insert([{ target_user: targetUser, text, post_id: postId, time: timeStr, read: false }]);
  };

  // 🛠️ [신규 반영] 이미지 업로드 시 자동 압축(리사이징) 로직 연결
  const handleMultiImageUpload = async (e: any) => { 
    const files = Array.from(e.target.files) as File[];
    const compressedFiles: File[] = [];
    const previewUrls: string[] = [];

    for (const file of files) {
      const compressed = await compressImage(file);
      compressedFiles.push(compressed);
      
      const reader = new FileReader();
      const url = await new Promise<string>((res) => {
        reader.onloadend = () => res(reader.result as string);
        reader.readAsDataURL(compressed);
      });
      previewUrls.push(url);
    }
    
    setWriteFiles((prev: File[]) => [...prev, ...compressedFiles]);
    setWriteImages((prev: string[]) => [...prev, ...previewUrls]);
  };

  const saveProfileInfo = async () => {
    if (!userProfile.nickname.trim()) return alert("닉네임을 입력해주세요.");
    const { data: existingUser } = await supabase.from('profiles').select('user_id').eq('nickname', userProfile.nickname).neq('user_id', auth.userId).maybeSingle();
    if (existingUser) return alert("🚨 이미 다른 분이 사용 중인 닉네임입니다.");

    const { error } = await supabase.from('profiles').upsert([{
      user_id: auth.userId, nickname: userProfile.nickname, share_posts: userProfile.sharePosts, share_comments: userProfile.shareComments
    }]);
    if (error) alert("설정 저장에 실패했습니다.");
    else { alert("내 정보 및 공개 설정이 안전하게 저장되었습니다."); fetchTargetData(); }
  };

  const isValidForRanking = (p: any) => { try { if (!p.time) return false; const pTime = new Date(p.time.replace(' ', 'T')).getTime(); const sevenDaysAgo = Date.now() - 7 * 86400000; const today = new Date().setHours(0,0,0,0); return pTime >= sevenDaysAgo && p.status !== "종료" && (!p.endDate || new Date(p.endDate).getTime() >= today); } catch(e) { return false; } };
  const getUserDisplayName = (userId: string) => profilesDb[userId]?.nickname || userId;

  const styles = {
    container: "w-full px-4 md:w-[70%] mx-auto pt-6 md:pt-12 pb-24 font-sans text-slate-900 bg-slate-50/50 min-h-screen antialiased",
    primaryButton: "bg-slate-900 text-white py-3 px-5 rounded-2xl flex justify-center items-center h-full w-full font-bold shadow-sm hover:bg-slate-800 active:scale-[0.98] transition-all duration-150 text-sm whitespace-nowrap",
    secondaryButton: "bg-white text-slate-700 py-3 px-5 rounded-2xl border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition-all duration-150 flex justify-center items-center h-full w-full font-bold text-sm whitespace-nowrap",
    tertiaryButton: "bg-transparent border-none text-slate-800 hover:text-blue-600 transition-colors duration-150 p-0 m-0 text-left justify-start w-full text-[15px] font-medium"
  };

  return (
    <>
      <Head>
        <title>할인모아 - 흩어진 혜택을 한곳에</title>
      </Head>

      <div className={styles.container}>
        
        {toast.show && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3.5 rounded-2xl shadow-xl z-50 text-sm font-bold flex items-center gap-2">
            <span className="text-blue-400">🔔</span> {toast.message}
          </div>
        )}

        {/* 1. 상단 헤더 */}
        {!["글쓰기", "글수정", "회원가입", "비밀번호찾기", "로그인"].includes(currentView) && (
          <div className="mb-6 md:mb-8">
            <header className="flex flex-col md:flex-row w-full items-center justify-between mb-6 gap-4 md:h-[48px]">
              <div className="w-full md:w-auto flex-shrink-0 flex justify-between items-center md:block">
                <button onClick={() => navigate("로비")} className="text-2xl font-black tracking-tight text-slate-900 hover:opacity-80 transition-opacity">
                  할인모아 <span className="text-blue-600 text-xl">.</span>
                </button>
              </div>
              
              <div className="w-full md:w-[350px] lg:w-[450px] h-[44px] md:mx-auto">
                <input 
                  type="text" 
                  placeholder="모든 핫딜과 페이백 검색 (엔터)" 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  onKeyDown={(e) => { 
                    if (e.key === 'Enter') { setActiveSearch(searchQuery); if(currentView === "로비") navigate("핫딜 커뮤니티"); } 
                  }} 
                  className="w-full h-full px-4 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:border-slate-400 transition-all text-sm shadow-sm" 
                />
              </div>
              
              <div className="w-full md:w-auto flex items-center justify-end gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide h-[44px]">
                {!auth.loggedIn ? (
                  <>
                    <button onClick={() => navigate("로그인")} className="px-4 text-sm font-bold text-slate-600 hover:text-slate-900">로그인</button>
                    <button onClick={() => navigate("회원가입")} className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors">시작하기</button>
                  </>
                ) : (
                  <>
                    <div className="text-sm px-2 font-bold text-slate-800 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span> {userProfile.nickname}님
                    </div>
                    <button onClick={() => navigate("알림")} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                      🔔 {notifications[auth.userId]?.filter((n:any)=>!n.read).length > 0 ? `(${notifications[auth.userId].filter((n:any)=>!n.read).length})` : ""}
                    </button>
                    <button onClick={() => navigate("마이페이지")} className="px-3 text-sm font-bold text-slate-600 hover:text-slate-900">내 정보</button>
                    {auth.userRole === "admin" && <button onClick={() => navigate("사이트 관리")} className="px-3 text-sm font-bold text-red-500">관리자</button>}
                    <button onClick={async () => { await supabase.auth.signOut(); navigate("로비"); }} className="px-3 text-sm font-bold text-slate-400 hover:text-slate-600">로그아웃</button>
                  </>
                )}
              </div>
            </header>

            <nav className="flex w-full justify-between items-center gap-1.5 overflow-x-auto whitespace-nowrap py-2 scrollbar-hide border-b border-slate-200/60">
              {CATEGORIES.map((cat) => {
                const targetCat = cat === "공지사항" ? "공지사항" : cat;
                let hasNew = false;
                try { hasNew = posts.some(p => p.category === targetCat && p.time && (Date.now() - new Date(p.time.replace(' ', 'T')).getTime()) / 3600000 <= 6); } catch(e) {}
                
                return (
                  <button 
                    key={cat} 
                    onClick={() => navigate(cat)} 
                    className={`flex-1 text-center px-2 py-2.5 rounded-2xl text-[13px] md:text-sm font-bold transition-all ${currentView === cat ? "bg-white text-slate-900 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-900"}`}
                  >
                    {hasNew ? `${cat} 🔹` : cat}
                  </button>
                );
              })}
            </nav>
          </div>
        )}

        <div className="w-full">
            {isLoading && (
              <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-900 border-t-transparent"></div></div>
            )}

            {/* 2. 로그인 */}
            {currentView === "로그인" && (
              <div className="w-full md:max-w-md mx-auto bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 mt-6">
                <h1 className="text-2xl font-black mb-2 tracking-tight">반가워요 👋</h1>
                <p className="mb-6 text-slate-500 text-sm">안전하고 똑똑하게 혜택을 모아보세요.</p>
                
                <div className="space-y-3 mb-6">
                  <button onClick={() => handleSocialLogin('kakao')} className="w-full bg-[#FEE500] text-black font-bold py-3.5 rounded-2xl shadow-sm flex justify-center items-center gap-2 text-sm hover:opacity-95 transition-opacity">💬 카카오로 3초만에 시작</button>
                  <button onClick={() => handleSocialLogin('naver')} className="w-full bg-[#03C75A] text-white font-bold py-3.5 rounded-2xl shadow-sm flex justify-center items-center gap-2 text-sm hover:opacity-95 transition-opacity">N 네이버로 시작하기</button>
                </div>
                
                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-slate-100"></div>
                  <span className="flex-shrink mx-4 text-slate-400 text-xs font-semibold">또는 이메일 로그인</span>
                  <div className="flex-grow border-t border-slate-100"></div>
                </div>

                <div className="space-y-4 mt-4">
                  <input type="text" placeholder="네이버 이메일 주소" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} className="w-full p-3.5 bg-slate-50 border border-slate-200/60 rounded-2xl focus:outline-none focus:border-slate-400 transition-all text-sm" />
                  
                  <div className="relative">
                    <input type={showLoginPw ? "text" : "password"} placeholder="비밀번호" value={loginPw} onChange={e=>setLoginPw(e.target.value)} className="w-full p-3.5 bg-slate-50 border border-slate-200/60 rounded-2xl focus:outline-none focus:border-slate-400 transition-all text-sm pr-12" />
                    <button type="button" onClick={() => setShowLoginPw(!showLoginPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">{showLoginPw ? "🙈" : "👁️"}</button>
                  </div>
                  
                  <div className="pt-2 space-y-2">
                    <button onClick={async ()=>{
                      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPw });
                      if (error) alert("🚨 계정 정보가 일치하지 않습니다."); else navigate("로비");
                    }} className={styles.primaryButton}>로그인</button>
                    <button onClick={()=>navigate("로비")} className={styles.secondaryButton}>취소</button>
                  </div>
                </div>
                
                <div className="flex justify-center gap-4 mt-6 text-xs font-bold text-slate-500">
                  <button onClick={()=>navigate("회원가입")} className="hover:text-slate-900">회원가입</button>
                  <span className="text-slate-200">|</span>
                  <button onClick={()=>navigate("비밀번호찾기")} className="hover:text-slate-900">비밀번호 찾기</button>
                </div>
              </div>
            )}

            {/* 3. 회원가입 */}
            {currentView === "회원가입" && (
              <div className="w-full md:max-w-md mx-auto bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 mt-6">
                <h1 className="text-2xl font-black mb-6 tracking-tight">회원가입</h1>
                <div className="space-y-4">
                  <div className="flex gap-3 mb-2">
                    <button onClick={() => handleSocialLogin('kakao')} className="flex-1 bg-[#FEE500] text-black font-bold py-3.5 rounded-2xl shadow-sm text-sm hover:opacity-90 transition-opacity">💬 카카오 시작</button>
                    <button onClick={() => handleSocialLogin('naver')} className="flex-1 bg-[#03C75A] text-white font-bold py-3.5 rounded-2xl shadow-sm text-sm hover:opacity-90 transition-opacity">N 네이버 시작</button>
                  </div>
                  
                  <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-slate-100"></div>
                    <span className="flex-shrink mx-4 text-slate-400 text-xs font-semibold">또는 네이버 메일로 가입</span>
                    <div className="flex-grow border-t border-slate-100"></div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">네이버 이메일</label>
                    <input type="text" value={regEmail} onChange={e=>setRegEmail(e.target.value)} className="w-full p-3.5 bg-slate-50 border border-slate-200/60 rounded-2xl focus:outline-none focus:border-slate-400 text-sm" placeholder="example@naver.com" />
                    <p className="text-[11px] text-slate-400 mt-1">※ 안전을 위해 오직 @naver.com 주소만 허용됩니다.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">비밀번호</label>
                    <div className="relative">
                      <input type={showRegPw ? "text" : "password"} value={regPw} onChange={e=>setRegPw(e.target.value)} className="w-full p-3.5 bg-slate-50 border border-slate-200/60 rounded-2xl focus:outline-none focus:border-slate-400 text-sm pr-12" placeholder="영문, 숫자, 특수기호 포함" />
                      <button type="button" onClick={() => setShowRegPw(!showRegPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">{showRegPw ? "🙈" : "👁️"}</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">비밀번호 확인</label>
                    <div className="relative">
                      <input type={showRegPwChk ? "text" : "password"} value={regPwChk} onChange={e=>setRegPwChk(e.target.value)} className="w-full p-3.5 bg-slate-50 border border-slate-200/60 rounded-2xl focus:outline-none focus:border-slate-400 text-sm pr-12" placeholder="비밀번호 재입력" />
                      <button type="button" onClick={() => setShowRegPwChk(!showRegPwChk)} className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">{showRegPwChk ? "🙈" : "👁️"}</button>
                    </div>
                  </div>
                  
                  <div className="pt-4 space-y-2">
                    <button onClick={async ()=>{
                      const hasEng = /[a-zA-Z]/.test(regPw); const hasNum = /\d/.test(regPw); const hasSpecial = /[!@#$%^&*()_\-+=\[\]{};':"\\|,.<>\/?]/.test(regPw);
                      if (!regEmail || !regPw) return alert("빈칸을 모두 입력해 주세요.");
                      if (!regEmail.endsWith("@naver.com")) return alert("🚨 네이버 이메일(@naver.com)만 가입 가능합니다.");
                      if (!(hasEng && hasNum && hasSpecial)) return alert("🚨 비밀번호는 영문+숫자+특수문자 조합이어야 합니다.");
                      if (regPw !== regPwChk) return alert("🚨 비밀번호 확인이 일치하지 않습니다.");
                      const { error } = await supabase.auth.signUp({ email: regEmail, password: regPw });
                      if (error) alert("가입 실패 (이미 가입된 이메일일 수 있습니다): " + error.message);
                      else { alert("🎉 회원가입 성공! 메일함의 인증 링크를 클릭 후 로그인해 주세요."); navigate("로그인"); }
                    }} className={styles.primaryButton}>가입 완료하기</button>
                    <button onClick={()=>navigate("로비")} className={styles.secondaryButton}>취소</button>
                  </div>
                </div>
              </div>
            )}

            {/* 4. 비밀번호 찾기 */}
            {currentView === "비밀번호찾기" && (
              <div className="w-full md:max-w-md mx-auto bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 mt-6">
                <h1 className="text-2xl font-black mb-4 tracking-tight">비밀번호 재설정</h1>
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 text-blue-700 rounded-2xl text-xs font-semibold leading-relaxed">
                    가입하신 네이버 이메일 주소를 입력하시면 안전한 패스워드 재설정 링크를 보내드립니다.
                  </div>
                  <input type="text" value={findEmail} onChange={e=>setFindEmail(e.target.value)} className="w-full p-3.5 bg-slate-50 border border-slate-200/60 rounded-2xl focus:outline-none focus:border-slate-400 text-sm" placeholder="example@naver.com" />
                  <div className="pt-2 space-y-2">
                    <button onClick={async ()=>{
                      if (!findEmail.endsWith("@naver.com")) return alert("올바른 네이버 이메일 형식을 입력하세요.");
                      const { error } = await supabase.auth.resetPasswordForEmail(findEmail, { redirectTo: window.location.origin });
                      if (error) alert("발송 실패: " + error.message);
                      else alert(`✅ [${findEmail}] 메일함으로 재설정 주소가 날아갔습니다.`);
                    }} className={styles.primaryButton}>인증 메일 쏘기</button>
                    <button onClick={()=>navigate("로그인")} className={styles.secondaryButton}>돌아가기</button>
                  </div>
                </div>
              </div>
            )}

            {/* 5. 알림 센터 */}
            {currentView === "알림" && (
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm mt-6">
                {!auth.loggedIn ? (
                  <p className="text-slate-500 font-bold text-center py-6 text-sm">로그인이 필요합니다.</p>
                ) : (
                  <>
                    <div className="flex justify-between items-center mb-6">
                      <h1 className="text-xl font-black tracking-tight">🔔 실시간 알림</h1>
                      {notifications[auth.userId]?.length > 0 && (
                        <button onClick={async ()=>{ 
                          setNotifications((prev:any)=>({...prev, [auth.userId]: prev[auth.userId].map((n:any)=>({...n, read:true}))}));
                          await supabase.from('notifications').update({ read: true }).eq('target_user', auth.userId);
                        }} className="text-xs text-blue-600 font-bold hover:underline bg-blue-50 px-3 py-1.5 rounded-xl">모두 읽음 처리</button>
                      )}
                    </div>
                    {(!notifications[auth.userId] || notifications[auth.userId].length === 0) ? (
                      <p className="text-slate-400 text-center py-12 text-sm font-semibold">아직 도착한 알림이 없어요.</p>
                    ) : (
                      <div className="space-y-3">
                        {notifications[auth.userId].map((n:any)=>(
                          <div key={n.id} className={`p-4 rounded-2xl border transition-all ${n.read ? "bg-slate-50/50 border-slate-100" : "bg-white border-blue-200 shadow-sm"}`}>
                            <p className="text-sm font-bold text-slate-800">{!n.read && <span className="text-blue-500 mr-1.5">●</span>}{n.text}</p>
                            <p className="text-[11px] text-slate-400 mt-2 font-semibold">{n.time}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 6. 로비 */}
            {currentView === "로비" && !isLoading && (
              <div className="space-y-6">
                {mainBanner.isActive && (
                  <a href={mainBanner.targetLink} target="_blank" rel="noreferrer" className="block w-full transition-transform active:scale-[0.99]">
                    <img src={mainBanner.imageUrl} className="w-full h-auto rounded-3xl object-cover shadow-sm border border-slate-100" alt="banner" />
                  </a>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <h4 className="font-black text-lg mb-4 tracking-tight text-slate-800 flex items-center justify-between">
                      <span>📊 이번 주 인기 할인</span>
                      <span className="text-xs text-slate-400 font-bold">인기순</span>
                    </h4>
                    <div className="space-y-3">
                      {(() => {
                        const validDisc = posts.filter(p => ["옷","음식","여가","쇼핑","여행"].includes(p.category) && p.author === "ext9999" && isValidForRanking(p)).sort((a,b)=>b.upvotes-a.upvotes).slice(0,3);
                        if (validDisc.length === 0) return <p className="text-slate-400 text-xs py-4 font-semibold">모여있는 베스트 정보가 아직 없습니다.</p>;
                        return validDisc.map((p, idx) => (
                          <div key={p.id} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
                            <span className="text-lg font-black text-slate-300 w-5 text-center">{idx+1}</span>
                            <button onClick={()=>handleViewPost(p.id, p.category)} className="text-sm font-bold text-slate-700 hover:text-blue-600 truncate flex-1 text-left">
                              [{p.category}] {p.title}
                            </button>
                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-xl">👍 {p.upvotes}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <h4 className="font-black text-lg mb-4 tracking-tight text-slate-800 flex items-center justify-between">
                      <span>🔥 실시간 핫딜</span>
                      <button onClick={()=>navigate("핫딜 커뮤니티")} className="text-xs text-blue-600 font-bold hover:underline bg-blue-50 px-3 py-1 rounded-xl">더보기 &gt;</button>
                    </h4>
                    <div className="space-y-3">
                      {(() => {
                        const validHot = posts.filter(p => p.category === "핫딜 커뮤니티" && isValidForRanking(p)).sort((a,b)=>(b.thermoVotes?.hot||0)-(a.thermoVotes?.hot||0)).slice(0,3);
                        if (validHot.length === 0) return <p className="text-slate-400 text-xs py-4 font-semibold">실시간으로 달아오르는 핫딜이 아직 없습니다.</p>;
                        return validHot.map((p, idx) => (
                          <div key={p.id} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
                            <span className="text-lg font-black text-red-300 w-5 text-center">{idx+1}</span>
                            <button onClick={()=>handleViewPost(p.id, p.category)} className="text-sm font-bold text-slate-700 hover:text-red-500 truncate flex-1 text-left">
                              {p.mallName ? `[${p.mallName}] ` : ""}{p.title}
                            </button>
                            <span className="text-xs font-bold text-red-500 bg-red-50 px-2.5 py-1 rounded-xl">🔥 {p.thermoVotes?.hot||0}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 7. 카테고리 홈 & 리스트 */}
            {CATEGORIES.includes(currentView) && !focusPostId && (
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-white p-5 rounded-3xl border border-slate-100 shadow-sm mb-2">
                  <h3 className="text-xl font-black tracking-tight text-slate-800">{currentView}</h3>
                  {(auth.userRole === "admin" || ["핫딜 커뮤니티", "요청"].includes(currentView)) && (
                    <button onClick={()=>{ setWritingCategory(currentView); setWriteSubCat("일반"); navigate("글쓰기"); }} className="px-5 py-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 transition-colors shadow-sm">📝 새 글 쓰기</button>
                  )}
                </div>

                <div className="flex justify-between items-center gap-2">
                  <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap py-1 scrollbar-hide flex-1">
                    {subCategories[currentView]?.map((sub: string) => (
                      <button 
                        key={sub} 
                        onClick={() => { setSelectedSub(sub); setCurrentPage(1); }}
                        className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${selectedSub === sub ? "bg-slate-900 text-white shadow-sm" : "bg-white border border-slate-200/80 text-slate-500 hover:text-slate-900"}`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                  <div className="flex-shrink-0">
                    <select value={sortOption} onChange={(e) => { setSortOption(e.target.value); setCurrentPage(1); }} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none text-slate-600 shadow-sm cursor-pointer">
                      <option value="최신순">최신순</option>
                      <option value="조회순">조회순</option>
                      <option value="추천순">추천순</option>
                    </select>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden py-2 px-2 md:px-4">
                  {!isLoading && posts.length === 0 ? (
                    <p className="p-12 text-center text-slate-400 text-sm font-semibold">조건에 맞는 피드가 비어있어요.</p>
                  ) : posts.map(p => {
                    let isExp = false;
                    try { isExp = p.status === "종료" || (p.endDate && new Date(p.endDate) < new Date(new Date().setHours(0,0,0,0))); } catch(e) {}
                    const expTag = (isExp && selectedSub !== "종료") ? <span className="text-red-500 font-bold mr-1.5">[종료]</span> : "";
                    
                    let titleStr = `${expTag}${currentView==="핫딜 커뮤니티" && p.mallName ? `[${p.mallName}] ` : ""}${p.title}`;
                    if (currentView === "핫딜 커뮤니티" && p.price) titleStr += ` (${p.price})`;
                    
                    return (
                      <div key={p.id} className="hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-none rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <span className="inline-block text-[11px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg mr-2 mb-1.5">{p.subCategory || "일반"}</span>
                          <button onClick={()=>handleViewPost(p.id, p.category)} className="text-sm font-bold text-slate-800 hover:text-blue-600 block text-left truncate w-full">
                            {titleStr}{p.image || p.images?.length > 0 ? " 🖼️" : ""}
                          </button>
                        </div>
                        <div className="flex items-center text-xs text-slate-400 font-semibold gap-3 shrink-0">
                          <button onClick={() => handleAuthorClick(p.author)} className="font-bold text-slate-600 hover:underline max-w-[90px] truncate">{getUserDisplayName(p.author)}</button>
                          <span>👀 {p.views}</span>
                          <span className={`font-bold ${currentView==="핫딜 커뮤니티"?"text-red-500":"text-blue-600"}`}>
                            {currentView==="핫딜 커뮤니티" ? `🔥 ${p.thermoVotes?.hot||0}` : `👍 ${p.upvotes}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-1.5 mt-8 justify-center flex-wrap">
                   {Array.from({length: totalPages}, (_,i)=>i+1).map(pageNum => (
                     <button 
                       key={pageNum} 
                       onClick={()=>setCurrentPage(pageNum)} 
                       className={`w-9 h-9 rounded-xl text-xs font-bold transition-all ${currentPage === pageNum ? "bg-slate-900 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                     >
                       {pageNum}
                     </button>
                   ))}
                </div>
              </div>
            )}

            {/* 8. 게시글 상세 보기 */}
            {CATEGORIES.includes(currentView) && focusPostId && (
              (() => {
                const post = posts.find(p => p.id === focusPostId);
                if (!post) return <div className="p-6 bg-white border rounded-3xl text-center text-sm font-bold text-slate-400">피드를 불러오는 중입니다...</div>;
                
                let isExpired = false;
                try { isExpired = (!["공지사항", "요청"].includes(currentView)) && ((post.endDate && new Date(post.endDate) < new Date(new Date().setHours(0,0,0,0))) || post.status === "종료"); } catch(e){}
                const isHot = currentView === "핫딜 커뮤니티";

                return (
                  <div className="bg-white border border-slate-100 p-5 md:p-8 rounded-3xl shadow-sm space-y-6">
                    <div>
                      <button onClick={()=>navigate(currentView)} className="text-xs font-black text-slate-400 hover:text-slate-900 flex items-center gap-1">← 목록으로 돌아가기</button>
                    </div>
                    
                    <div className="space-y-3">
                      <span className="inline-block text-xs font-black bg-blue-50 text-blue-600 px-3 py-1 rounded-xl">{post.subCategory||"일반"}</span>
                      <h1 className="text-xl md:text-2xl font-black text-slate-900 leading-snug tracking-tight">
                        {isExpired && <span className="text-slate-400">[마감] </span>}
                        {post.title}
                      </h1>
                    </div>
                    
                    {isHot && post.mallName && (
                      <div className="grid grid-cols-3 gap-2 bg-slate-50 p-4 rounded-2xl text-center text-xs font-bold text-slate-600 border border-slate-100">
                        <div className="space-y-1"><p className="text-slate-400 text-[10px]">쇼핑몰</p><p className="truncate text-sm">{post.mallName}</p></div>
                        <div className="space-y-1"><p className="text-slate-400 text-[10px]">가격</p><p className="text-red-500 truncate text-sm">{post.price}</p></div>
                        <div className="space-y-1"><p className="text-slate-400 text-[10px]">배송비</p><p className="truncate text-sm">{post.shipping}</p></div>
                      </div>
                    )}
                    
                    <div className="flex flex-col md:flex-row md:items-center justify-between text-xs text-slate-400 font-semibold border-b border-slate-50 pb-4 gap-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleAuthorClick(post.author)} className="font-black text-slate-700 hover:underline">{getUserDisplayName(post.author)}</button>
                        <span>•</span><span>🕒 {post.time}</span><span>•</span><span>👀 조회 {post.views}</span>
                      </div>
                      {post.link && (
                        <a href={post.link} target="_blank" rel="noreferrer" className={isExpired ? "px-4 py-2 bg-slate-100 text-slate-400 rounded-xl text-xs font-bold pointer-events-none text-center" : "px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm text-center"}>
                          🔗 구매/이동 링크
                        </a>
                      )}
                    </div>
                    
                    <div className="space-y-4">
                      {post.images?.map((imgUrl: string, idx: number) => (
                        <img key={idx} src={imgUrl} className="w-full rounded-2xl border border-slate-100 object-contain max-h-[600px]" alt="" />
                      )) || (post.image && <img src={post.image} className="w-full rounded-2xl border border-slate-100 object-contain max-h-[600px]" alt="" />)}
                    </div>

                    <div className="whitespace-pre-wrap leading-relaxed text-[15px] text-slate-800 tracking-tight break-words py-4">{post.content}</div>
                    
                    <div className="flex flex-wrap gap-2 pt-6 justify-center">
                      {isHot ? (
                        <>
                          <button onClick={() => {
                            if(!auth.loggedIn) return alert("로그인 필요");
                            let newV = { ...(post.thermoVotes || {hot:0,soso:0,cold:0}) }, newBy = { ...(post.thermoVotedBy || {}) }, newUps = post.upvotes;
                            if(newBy[auth.userId] === "hot") { newV.hot--; delete newBy[auth.userId]; newUps--; } 
                            else { if(newBy[auth.userId]) newV[newBy[auth.userId]]--; newV.hot++; newBy[auth.userId]="hot"; newUps++; }
                            setPosts((prev: any[]) => prev.map(p=> p.id===post.id ? {...p, thermoVotes: newV, thermoVotedBy: newBy, upvotes: newUps} : p));
                            syncUpdateToDB(post.id, { thermoVotes: newV, thermoVotedBy: newBy, upvotes: newUps });
                          }} className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 ${post.thermoVotedBy?.[auth.userId]==="hot" ? "bg-orange-500 text-white shadow-md scale-[0.98]" : "bg-slate-50 border border-slate-200/60 text-slate-700 hover:bg-slate-100"}`}>
                            🔥 대박이다 ({post.thermoVotes?.hot||0})
                          </button>
                          
                          <button onClick={() => {
                            if(!auth.loggedIn) return alert("로그인 필요");
                            let newV = { ...(post.thermoVotes || {hot:0,soso:0,cold:0}) }, newBy = { ...(post.thermoVotedBy || {}) };
                            if(newBy[auth.userId] === "soso") { newV.soso--; delete newBy[auth.userId]; } 
                            else { if(newBy[auth.userId]) newV[newBy[auth.userId]]--; newV.soso++; newBy[auth.userId]="soso"; }
                            setPosts((prev: any[]) => prev.map(p=> p.id===post.id ? {...p, thermoVotes: newV, thermoVotedBy: newBy} : p));
                            syncUpdateToDB(post.id, { thermoVotes: newV, thermoVotedBy: newBy });
                          }} className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 ${post.thermoVotedBy?.[auth.userId]==="soso" ? "bg-slate-700 text-white shadow-md scale-[0.98]" : "bg-slate-50 border border-slate-200/60 text-slate-700 hover:bg-slate-100"}`}>
                            🤔 평범함 ({post.thermoVotes?.soso||0})
                          </button>

                          <button onClick={() => {
                            if(!auth.loggedIn) return alert("로그인 필요");
                            let newV = { ...(post.thermoVotes || {hot:0,soso:0,cold:0}) }, newBy = { ...(post.thermoVotedBy || {}) };
                            if(newBy[auth.userId] === "cold") { newV.cold--; delete newBy[auth.userId]; } 
                            else { if(newBy[auth.userId]) newV[newBy[auth.userId]]--; newV.cold++; newBy[auth.userId]="cold"; }
                            setPosts((prev: any[]) => prev.map(p=> p.id===post.id ? {...p, thermoVotes: newV, thermoVotedBy: newBy} : p));
                            syncUpdateToDB(post.id, { thermoVotes: newV, thermoVotedBy: newBy });
                          }} className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 ${post.thermoVotedBy?.[auth.userId]==="cold" ? "bg-blue-500 text-white shadow-md scale-[0.98]" : "bg-slate-50 border border-slate-200/60 text-slate-700 hover:bg-slate-100"}`}>
                            🥶 별로임 ({post.thermoVotes?.cold||0})
                          </button>
                        </>
                      ) : (
                        <button onClick={() => {
                          if(!auth.loggedIn) return alert("로그인 필요");
                          const isUp = post.upvotedBy?.includes(auth.userId);
                          const newUps = isUp ? post.upvotes - 1 : post.upvotes + 1;
                          const newUpBy = isUp ? post.upvotedBy.filter((u:any)=>u!==auth.userId) : [...(post.upvotedBy||[]), auth.userId];
                          setPosts((prev: any[]) => prev.map(p=>p.id===post.id ? {...p, upvotes: newUps, upvotedBy: newUpBy} : p));
                          syncUpdateToDB(post.id, { upvotes: newUps, upvotedBy: newUpBy });
                        }} className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all ${post.upvotedBy?.includes(auth.userId) ? "bg-blue-600 text-white" : "bg-slate-50 border border-slate-200/60 text-slate-700 hover:bg-slate-100"}`}>
                          {post.upvotedBy?.includes(auth.userId) ? `👍 추천 취소됨 (${post.upvotes})` : `👍 유용해요 (${post.upvotes})`}
                        </button>
                      )}
                      
                      <button onClick={() => {
                        if(!auth.loggedIn) return alert("로그인 필요");
                        const isScrap = post.scrappedBy?.includes(auth.userId);
                        const newScrap = isScrap ? post.scrappedBy.filter((u:any)=>u!==auth.userId) : [...(post.scrappedBy||[]), auth.userId];
                        setPosts((prev: any[]) => prev.map(p=>p.id===post.id ? {...p, scrappedBy: newScrap} : p));
                        syncUpdateToDB(post.id, { scrappedBy: newScrap });
                      }} className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all ${post.scrappedBy?.includes(auth.userId) ? "bg-yellow-400 text-slate-800" : "bg-slate-50 border border-slate-200/60 text-slate-700 hover:bg-slate-100"}`}>
                        ⭐ 스크랩
                      </button>
                    </div>
                    
                    <div className="flex gap-2 justify-center pt-2">
                      <button onClick={async () => {
                        if(!auth.loggedIn) return alert("로그인 필요");
                        const isRep = post.reportedBy?.includes(auth.userId);
                        const newRep = isRep ? post.reportedBy.filter((u:any)=>u!==auth.userId) : [...(post.reportedBy||[]), auth.userId];
                        if(newRep.length >= 10) { 
                          alert("신고 10회 누적으로 글이 블라인드 처리되었습니다."); 
                          setPosts((prev: any[]) => prev.filter(p=>p.id!==post.id));
                          if (post.id >= 10000) await supabase.from('deals').delete().eq('id', post.id - 10000);
                          navigate(currentView); 
                        } else {
                          setPosts((prev: any[]) => prev.map(p=>p.id===post.id ? {...p, reportedBy: newRep} : p));
                          syncUpdateToDB(post.id, { reportedBy: newRep });
                        }
                      }} className="px-4 py-2 bg-red-50 text-red-500 text-[11px] font-bold rounded-xl hover:bg-red-100 transition-colors">
                        🚨 신고하기 ({post.reportedBy?.length||0})
                      </button>

                      {(auth.userRole === "admin" || auth.userId === post.author) && (
                        <>
                          <button onClick={()=>{
                            setWriteTitle(post.title); setWriteContent(post.content); setWriteLink(post.link); setWriteImages(post.images || []); 
                            if (post.endDate) { setWriteEndDate(post.endDate); setIsNoLimit(false); } 
                            else { setWriteEndDate(new Date().toISOString().split('T')[0]); setIsNoLimit(true); }
                            setWriteMall(post.mallName||""); setWritePrice(post.price||""); setWriteShipping(post.shipping||"무료배송"); setEditingPostId(post.id); setCurrentView("글수정"); window.scrollTo(0,0);
                          }} className="px-4 py-2 bg-slate-100 text-slate-700 text-[11px] font-bold rounded-xl hover:bg-slate-200 transition-colors">수정</button>
                          <button onClick={async ()=>{ 
                            if (window.confirm("삭제하시겠습니까?")) {
                              setPosts((prev: any[]) => prev.filter(p=>p.id!==post.id)); 
                              if (post.id >= 10000) await supabase.from('deals').delete().eq('id', post.id - 10000);
                              navigate(currentView); 
                            }
                          }} className="px-4 py-2 bg-red-600 text-white text-[11px] font-bold rounded-xl hover:bg-red-700 transition-colors">삭제</button>
                        </>
                      )}
                    </div>

                    <div className="pt-8 border-t border-slate-100 space-y-4">
                      <h4 className="font-black text-sm text-slate-800">💬 피드백 ({post.comments?.length || 0})</h4>
                      <div className="space-y-3">
                        {post.comments?.map((cmt: any) => (
                          <div key={cmt.id} className="bg-slate-50/70 rounded-2xl p-4 border border-slate-100/60 text-sm">
                            <div className="text-slate-800 leading-relaxed flex flex-wrap items-center gap-1">
                              <button onClick={() => handleAuthorClick(cmt.user)} className="font-black text-slate-700 hover:underline mr-1.5">{getUserDisplayName(cmt.user)}</button>
                              : {cmt.text}
                              <span className="text-slate-400 text-[10px] ml-2">({cmt.time})</span>
                              {(auth.userId === cmt.user || auth.userRole === "admin") && (
                                <button onClick={() => {
                                  if (window.confirm("정말로 이 댓글을 삭제하시겠습니까?")) {
                                    const newComments = post.comments.filter((c:any) => c.id !== cmt.id);
                                    setPosts((prev: any[]) => prev.map(p => p.id === post.id ? {...p, comments: newComments} : p));
                                    syncUpdateToDB(post.id, { comments: newComments });
                                  }
                                }} className="text-[10px] text-red-500 hover:text-red-700 ml-2 font-bold bg-white px-2 py-0.5 rounded-md border border-red-100">삭제</button>
                              )}
                            </div>
                            
                            {cmt.replies?.map((rep: any, rIdx: number) => (
                              <div key={rIdx} className="ml-4 mt-2 p-3 bg-white border border-slate-100 rounded-xl text-xs text-slate-700 flex flex-wrap items-center gap-1">
                                ↳ <button onClick={() => handleAuthorClick(rep.user)} className="font-black text-slate-600 hover:underline mr-1">{getUserDisplayName(rep.user)}</button>: {rep.text}
                                <span className="text-slate-400 text-[10px] ml-2">({rep.time})</span>
                                {(auth.userId === rep.user || auth.userRole === "admin") && (
                                  <button onClick={() => {
                                    if (window.confirm("정말로 이 답글을 삭제하시겠습니까?")) {
                                      const newReplies = cmt.replies.filter((_:any, idx:number) => idx !== rIdx);
                                      const newComments = post.comments.map((c:any) => c.id === cmt.id ? {...c, replies: newReplies} : c);
                                      setPosts((prev: any[]) => prev.map(p => p.id === post.id ? {...p, comments: newComments} : p));
                                      syncUpdateToDB(post.id, { comments: newComments });
                                    }
                                  }} className="text-[10px] text-red-500 hover:text-red-700 ml-2 font-bold bg-slate-50 px-2 py-0.5 rounded-md border border-red-100">삭제</button>
                                )}
                              </div>
                            ))}

                            {auth.loggedIn && (
                              <div className="ml-4 mt-3">
                                <button onClick={()=>setReplyOpen((prev:any)=>({...prev, [`${post.id}_${cmt.id}`]: !prev[`${post.id}_${cmt.id}`]}))} className="text-[11px] font-bold text-slate-500 hover:text-blue-600 transition-colors mb-2">
                                  ↳ '{getUserDisplayName(cmt.user)}'님에게 답글 달기
                                </button>
                                {replyOpen[`${post.id}_${cmt.id}`] && (
                                  <div className="flex gap-2">
                                    <input type="text" placeholder="답글 내용" value={replyInputs[`${post.id}_${cmt.id}`] || ""} onChange={(e)=>setReplyInputs({...replyInputs, [`${post.id}_${cmt.id}`]: e.target.value})} className="flex-1 p-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-slate-400 transition-all" />
                                    <button onClick={()=>{
                                      if(!replyInputs[`${post.id}_${cmt.id}`]) return;
                                      const newComments = post.comments.map((c:any)=>c.id===cmt.id ? {...c, replies: [...(c.replies||[]), {user: auth.userId, text: replyInputs[`${post.id}_${cmt.id}`], time: new Date().toISOString().replace('T', ' ').slice(0, 16)}]} : c);
                                      setPosts((prev: any[]) => prev.map(p=>p.id===post.id ? {...p, comments: newComments} : p));
                                      syncUpdateToDB(post.id, { comments: newComments });
                                      setReplyInputs({...replyInputs, [`${post.id}_${cmt.id}`]: ""}); 
                                      setReplyOpen((prev:any)=>({...prev, [`${post.id}_${cmt.id}`]: false})); 
                                      addNotify(cmt.user, "새로운 답글이 달렸습니다.", post.id);
                                    }} className="px-4 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 shrink-0">등록</button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {auth.loggedIn && (
                        <div className="flex gap-2 pt-4">
                          <input type="text" placeholder="댓글로 소통을 시작해 보세요." value={commentInput} onChange={(e)=>setCommentInput(e.target.value)} className="flex-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs focus:outline-none focus:border-slate-400 transition-all" />
                          <button onClick={()=>{
                            if(!commentInput) return;
                            const newComments = [...(post.comments||[]), {id: Date.now(), user: auth.userId, text: commentInput, time: new Date().toISOString().replace('T', ' ').slice(0, 16), replies: []}];
                            setPosts((prev: any[]) => prev.map(p=>p.id===post.id ? {...p, comments: newComments} : p));
                            syncUpdateToDB(post.id, { comments: newComments }); setCommentInput("");
                            addNotify(post.author, "게시글에 새 피드백이 쌓였습니다.", post.id); 
                          }} className="px-6 py-3.5 bg-slate-900 text-white rounded-2xl text-xs font-bold hover:bg-slate-800 shrink-0">작성</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
            )}

            {/* 9. 작성자 조회 화면 */}
            {currentView === "작성자 조회" && (
              <div className="bg-white border border-slate-100 p-6 md:p-8 rounded-3xl shadow-sm space-y-6">
                <div className="flex justify-between items-center">
                  <h1 className="text-xl font-black tracking-tight">👤 {getUserDisplayName(selectedTargetUser)} 님의 프로필</h1>
                  <button onClick={() => navigate("로비")} className="text-xs font-bold text-slate-400 hover:text-slate-900 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">로비로</button>
                </div>
                
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-slate-800">📝 작성한 게시글</h3>
                  {profilesDb[selectedTargetUser]?.share_posts ? (
                    (() => {
                      const userPosts = posts.filter(p => p.author === selectedTargetUser);
                      if(userPosts.length === 0) return <p className="text-xs text-slate-400 p-2 font-semibold">작성한 글이 없습니다.</p>;
                      return userPosts.map(p => (
                        <div key={p.id} onClick={() => handleViewPost(p.id, p.category)} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50 hover:bg-slate-100 cursor-pointer text-sm font-bold truncate transition-colors">
                          [{p.category}] {p.title}
                        </div>
                      ));
                    })()
                  ) : <p className="text-xs text-slate-400 font-bold bg-slate-50 p-4 rounded-xl border border-slate-100">🔒 활동 내역을 비공개로 설정한 유저입니다.</p>}
                </div>

                <div className="space-y-4 pt-6 border-t border-slate-100">
                  <h3 className="font-bold text-sm text-slate-800">💬 작성한 댓글</h3>
                  {profilesDb[selectedTargetUser]?.share_comments ? (
                    (() => {
                      const userCmts: any[] = [];
                      posts.forEach(p => p.comments?.forEach((c: any) => { if(c.user === selectedTargetUser) userCmts.push({ post: p, cmt: c }); }));
                      if(userCmts.length === 0) return <p className="text-xs text-slate-400 p-2 font-semibold">작성한 댓글이 없습니다.</p>;
                      return userCmts.map((item, idx) => (
                        <div key={idx} onClick={() => handleViewPost(item.post.id, item.post.category)} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50 hover:bg-slate-100 cursor-pointer text-sm font-bold transition-colors">
                          💬 {item.cmt.text}
                          <p className="text-[11px] text-slate-400 mt-1.5 truncate font-normal">원문: {item.post.title}</p>
                        </div>
                      ));
                    })()
                  ) : <p className="text-xs text-slate-400 font-bold bg-slate-50 p-4 rounded-xl border border-slate-100">🔒 댓글 내역을 비공개로 설정한 유저입니다.</p>}
                </div>
              </div>
            )}

            {/* 10. 글쓰기 */}
            {currentView === "글쓰기" && (
              <div className="bg-white border border-slate-100 p-6 md:p-8 rounded-3xl shadow-sm space-y-5">
                <h1 className="text-xl font-black tracking-tight">✍️ [{writingCategory}] 새 글 쓰기</h1>
                
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">말머리 선택</label>
                  <select value={writeSubCat} onChange={e=>setWriteSubCat(e.target.value)} className="w-full p-3 border border-slate-200 rounded-2xl text-xs font-bold bg-white focus:outline-none">
                    {subCategories[writingCategory]?.filter((s:any)=>s!=="전체"&&s!=="종료").map((s:any)=><option key={s} value={s}>{s}</option>) || <option value="일반">일반</option>}
                  </select>
                </div>
                
                {writingCategory === "핫딜 커뮤니티" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">🏢 쇼핑몰</label>
                      <input type="text" value={writeMall} onChange={e=>setWriteMall(e.target.value)} className="w-full p-3 border border-slate-200 rounded-2xl text-xs focus:outline-none" placeholder="쿠팡, G마켓 등"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">💰 할인가격</label>
                      <input type="text" value={writePrice} onChange={e=>setWritePrice(e.target.value)} className="w-full p-3 border border-slate-200 rounded-2xl text-xs focus:outline-none" placeholder="최종 혜택가"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">🚚 배송 요건</label>
                      <select value={writeShipping} onChange={e=>setWriteShipping(e.target.value)} className="w-full p-3 border border-slate-200 rounded-2xl text-xs font-bold bg-white focus:outline-none">
                        <option value="무료배송">무료배송</option><option value="유료배송">유료배송</option><option value="조건부 무료">조건부 무료</option><option value="기타">기타</option>
                      </select>
                    </div>
                  </div>
                )}
                
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">글 제목</label>
                  <input type="text" value={writeTitle} onChange={e=>setWriteTitle(e.target.value)} className="w-full p-3.5 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm focus:outline-none" placeholder="핵심 내용만 한눈에 들어오게 적어주세요"/>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">본문 내용</label>
                  <textarea rows={6} value={writeContent} onChange={e=>setWriteContent(e.target.value)} className="w-full p-3.5 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm focus:outline-none" placeholder="할인 및 페이백 적용을 위한 꿀팁을 공유해 주세요"/>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">📷 이미지 첨부 (다중선택 가능)</label>
                  <input type="file" multiple accept="image/*" onChange={handleMultiImageUpload} className="w-full p-3 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-xs cursor-pointer" />
                  
                  {writeImages.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto mt-4 p-3 bg-slate-50 border border-slate-100 rounded-2xl scrollbar-hide">
                      {writeImages.map((img, idx) => (
                        <div key={idx} className="relative w-20 h-20 flex-shrink-0 border rounded-xl overflow-hidden shadow-sm">
                          <img src={img} className="w-full h-full object-cover" alt="preview" />
                          <button onClick={() => {
                            setWriteImages((prev: string[]) => prev.filter((_, i) => i !== idx));
                            setWriteFiles((prev: File[]) => prev.filter((_, i) => i !== idx)); 
                          }} className="absolute top-0 right-0 bg-slate-900/80 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-bl-lg font-bold">X</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">🔗 구매/인증 주소 (선택)</label>
                  <input type="text" value={writeLink} onChange={e=>setWriteLink(e.target.value)} className="w-full p-3.5 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm focus:outline-none" placeholder="https://..."/>
                </div>
                
                {!["공지사항", "요청"].includes(writingCategory) && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-400">📆 핫딜/할인 마감일</label>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={isNoLimit} onChange={e => setIsNoLimit(e.target.checked)} className="w-3.5 h-3.5 accent-slate-900" />
                        기한 무제한
                      </label>
                    </div>
                    <input type="date" value={writeEndDate} onChange={e=>setWriteEndDate(e.target.value)} disabled={isNoLimit} className={`w-full p-3.5 border border-slate-200 rounded-2xl text-sm focus:outline-none ${isNoLimit ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-white cursor-pointer"}`}/>
                  </div>
                )}
                
                <div className="pt-4">
                  <button disabled={isUploading} onClick={async ()=>{
                    if(!writeTitle || !writeContent) return alert("제목과 내용을 채워주세요.");
                    setIsUploading(true); const uploadedUrls: string[] = [];

                    for (const file of writeFiles) {
                      const fileExt = file.name.split('.').pop();
                      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
                      const { error: uploadError } = await supabase.storage.from('images').upload(fileName, file);
                      if (!uploadError) {
                        const { data } = supabase.storage.from('images').getPublicUrl(fileName);
                        uploadedUrls.push(data.publicUrl);
                      }
                    }
                    
                    const { error } = await supabase.from('deals').insert([{ 
                      title: writeTitle, content: writeContent, price: writePrice, url: writeLink, category: writingCategory, sub_category: writeSubCat, author: auth.userId || "익명회원", mall_name: writeMall, shipping: writeShipping, 
                      end_date: isNoLimit ? null : writeEndDate, 
                      image: uploadedUrls[0] || null, images: uploadedUrls 
                    }]);
                    setIsUploading(false);
                    if(error) alert("업로드 중 통신 실패");
                    else { alert("✅ 업로드되어 피드에 성공적으로 누적되었습니다!"); fetchTargetData(); navigate(writingCategory); }
                  }} className={styles.primaryButton}>{isUploading ? "데이터 동기화 중..." : "등록하기"}</button>
                </div>
              </div>
            )}

            {/* 11. 글수정 */}
            {currentView === "글수정" && (
              <div className="bg-white border border-slate-100 p-6 md:p-8 rounded-3xl shadow-sm space-y-6">
                <h1 className="text-xl font-black mb-4 tracking-tight">📝 게시글 수정</h1>
                {(() => {
                  const post_to_edit = posts.find((p:any) => p.id === editingPostId);
                  if(!post_to_edit) return null;
                  return (
                    <div className="space-y-4">
                      {post_to_edit.category === "핫딜 커뮤니티" && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">🏢 쇼핑몰 이름</label>
                            <input type="text" value={writeMall} onChange={e=>setWriteMall(e.target.value)} className="w-full p-3 border border-slate-200 rounded-2xl text-xs focus:outline-none"/>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">💰 할인가격</label>
                            <input type="text" value={writePrice} onChange={e=>setWritePrice(e.target.value)} className="w-full p-3 border border-slate-200 rounded-2xl text-xs focus:outline-none"/>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">🚚 배송비</label>
                            <select value={writeShipping} onChange={e=>setWriteShipping(e.target.value)} className="w-full p-3 border border-slate-200 rounded-2xl text-xs bg-white focus:outline-none">
                              <option value="무료배송">무료배송</option><option value="유료배송">유료배송</option><option value="조건부 무료">조건부 무료</option><option value="기타">기타</option>
                            </select>
                          </div>
                        </div>
                      )}
                      
                      <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">글 제목</label>
                        <input type="text" value={writeTitle} onChange={e=>setWriteTitle(e.target.value)} className="w-full p-3.5 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm focus:outline-none" />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">글 내용</label>
                        <textarea rows={6} value={writeContent} onChange={e=>setWriteContent(e.target.value)} className="w-full p-3.5 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm focus:outline-none" />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">📷 사진 재첨부 (선택 시 기존 사진 덮어쓰기)</label>
                        <input type="file" multiple accept="image/*" onChange={handleMultiImageUpload} className="w-full p-3 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-xs cursor-pointer" />
                        
                        {writeImages.length > 0 && (
                          <div className="flex gap-2 overflow-x-auto mt-4 p-3 bg-slate-50 border border-slate-100 rounded-2xl scrollbar-hide">
                            {writeImages.map((img, idx) => (
                              <div key={idx} className="relative w-20 h-20 flex-shrink-0 border rounded-xl overflow-hidden shadow-sm">
                                <img src={img} className="w-full h-full object-cover" alt="preview" />
                                <button onClick={() => {
                                  setWriteImages((prev: string[]) => prev.filter((_, i) => i !== idx));
                                  setWriteFiles((prev: File[]) => prev.filter((_, i) => i !== idx));
                                }} className="absolute top-0 right-0 bg-slate-900/80 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-bl-lg font-bold">X</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">🔗 링크</label>
                        <input type="text" value={writeLink} onChange={e=>setWriteLink(e.target.value)} className="w-full p-3.5 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm focus:outline-none" />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-slate-400">📆 마감일</label>
                          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={isNoLimit} onChange={e => setIsNoLimit(e.target.checked)} className="w-3.5 h-3.5 accent-slate-900" />
                            기한 무제한
                          </label>
                        </div>
                        <input type="date" value={writeEndDate} onChange={e=>setWriteEndDate(e.target.value)} disabled={isNoLimit} className={`w-full p-3.5 border border-slate-200 rounded-2xl text-sm focus:outline-none ${isNoLimit ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-white cursor-pointer"}`} />
                      </div>

                      <div className="pt-4">
                        <button disabled={isUploading} onClick={async ()=>{
                          setIsUploading(true);
                          let finalUrls = writeImages; 

                          if (writeFiles.length > 0) {
                            const uploadedUrls: string[] = [];
                            for (const file of writeFiles) {
                              const fileExt = file.name.split('.').pop();
                              const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
                              const { error: uploadError } = await supabase.storage.from('images').upload(fileName, file);
                              if (!uploadError) {
                                const { data } = supabase.storage.from('images').getPublicUrl(fileName);
                                uploadedUrls.push(data.publicUrl);
                              }
                            }
                            finalUrls = uploadedUrls;
                          }

                          if (editingPostId && editingPostId >= 10000) {
                            await supabase.from('deals').update({ 
                              title: writeTitle, content: writeContent, url: writeLink, mall_name: writeMall, price: writePrice, shipping: writeShipping, 
                              end_date: isNoLimit ? null : writeEndDate, 
                              image: finalUrls[0] || post_to_edit.image, images: writeFiles.length > 0 ? finalUrls : post_to_edit.images 
                            }).eq('id', editingPostId - 10000);
                            fetchTargetData();
                          }
                          setIsUploading(false); alert("수정 완료!"); navigate(post_to_edit.category);
                        }} className={styles.primaryButton}>저장하기</button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* 12. 마이페이지 */}
            {currentView === "마이페이지" && auth.loggedIn && (
              <div className="bg-white border border-slate-100 p-6 md:p-8 rounded-3xl shadow-sm space-y-6">
                <h1 className="text-2xl font-black tracking-tight">👤 개인 계정 센터</h1>
                
                <div className="p-5 md:p-6 bg-slate-50/50 rounded-3xl border border-slate-100 space-y-5">
                  <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider">보안 & 프라이버시</h4>
                  <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer"><input type="checkbox" checked={userProfile.sharePosts} onChange={e => setUserProfile({...userProfile, sharePosts: e.target.checked})} className="w-4 h-4 accent-slate-900"/> 내 피드 목록 타인 조회 허용</label>
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer"><input type="checkbox" checked={userProfile.shareComments} onChange={e => setUserProfile({...userProfile, shareComments: e.target.checked})} className="w-4 h-4 accent-slate-900"/> 내 피드백(댓글) 목록 허용</label>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">활동 이름(닉네임) 변경</label>
                    <div className="flex gap-2">
                      <input type="text" value={userProfile.nickname} onChange={e => setUserProfile({...userProfile, nickname: e.target.value})} className="border border-slate-200 p-3 rounded-2xl text-sm flex-1 bg-white focus:outline-none focus:border-slate-400" />
                      <button onClick={saveProfileInfo} className="px-5 bg-slate-900 text-white rounded-2xl text-sm font-bold hover:bg-slate-800 shadow-sm">변경</button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border-b border-slate-100 pb-4">
                  {["내가 쓴 글", "내 피드백", "반응 내역", "⭐ 스크랩"].map((t, i)=>(
                    <button key={i} onClick={()=>setMyPageTab(i)} className={`py-3 px-3 rounded-2xl text-xs font-bold transition-all ${myPageTab === i ? "bg-slate-900 text-white shadow-sm" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}>{t}</button>
                  ))}
                </div>
                
                <div className="space-y-2 pt-2">
                  {myPageTab === 0 && (
                    posts.filter(p=>p.author===auth.userId).length === 0 ? <p className="text-center text-xs text-slate-400 py-10 font-bold">작성한 글이 없습니다.</p> :
                    posts.filter(p=>p.author===auth.userId).map(p=>(
                      <div key={p.id} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50 text-sm font-bold cursor-pointer hover:bg-white hover:shadow-sm transition-all truncate" onClick={()=>handleViewPost(p.id, p.category)}>
                        <span className="text-slate-400 text-xs mr-2 font-normal">[{p.category}]</span> {p.title}
                      </div>
                    ))
                  )}

                  {myPageTab === 1 && (
                    posts.flatMap(p => p.comments?.filter((c:any) => c.user === auth.userId).map((c:any) => ({ post: p, cmt: c }))).length === 0 ? <p className="text-center text-xs text-slate-400 py-10 font-bold">작성한 피드백이 없습니다.</p> :
                    posts.flatMap(p => p.comments?.filter((c:any) => c.user === auth.userId).map((c:any) => ({ post: p, cmt: c }))).map((item:any, idx:number) => (
                      <div key={idx} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50 cursor-pointer hover:bg-white hover:shadow-sm transition-all" onClick={()=>handleViewPost(item.post.id, item.post.category)}>
                        <b className="text-sm">💬 {item.cmt.text}</b>
                        <p className="text-[11px] text-slate-400 mt-2 truncate">원문: [{item.post.category}] {item.post.title}</p>
                      </div>
                    ))
                  )}

                  {myPageTab === 2 && (
                    posts.filter(p=>p.upvotedBy?.includes(auth.userId) || ["hot","soso","cold"].includes(p.thermoVotedBy?.[auth.userId])).length === 0 ? <p className="text-center text-xs text-slate-400 py-10 font-bold">평가를 남긴 피드가 없습니다.</p> :
                    posts.filter(p=>p.upvotedBy?.includes(auth.userId) || ["hot","soso","cold"].includes(p.thermoVotedBy?.[auth.userId])).map(p=>(
                      <div key={p.id} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50 text-sm font-bold cursor-pointer hover:bg-white hover:shadow-sm transition-all truncate" onClick={()=>handleViewPost(p.id, p.category)}>
                        <span className="text-slate-400 text-xs mr-2 font-normal">[{p.category}]</span> {p.title}
                      </div>
                    ))
                  )}

                  {myPageTab === 3 && (
                    posts.filter(p=>p.scrappedBy?.includes(auth.userId)).length === 0 ? <p className="text-center text-xs text-slate-400 py-10 font-bold">스크랩한 피드가 없습니다.</p> :
                    posts.filter(p=>p.scrappedBy?.includes(auth.userId)).map(p=>(
                      <div key={p.id} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50 flex flex-col md:flex-row justify-between items-center cursor-pointer hover:bg-white hover:shadow-sm transition-all gap-2 text-sm font-bold" onClick={()=>handleViewPost(p.id, p.category)}>
                        <div className="truncate w-full md:w-auto"><span className="text-slate-400 text-xs mr-2 font-normal">[{p.category}]</span> {p.title}</div>
                        <span className="text-[11px] text-slate-400 whitespace-nowrap bg-white px-2 py-1 rounded-lg border border-slate-100">{p.time ? p.time.split(' ')[0] : ""}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 13. 사이트 관리 */}
            {currentView === "사이트 관리" && auth.userRole === "admin" && (
              <div className="bg-white border border-slate-100 p-6 md:p-8 rounded-3xl shadow-sm space-y-8">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                  <h1 className="text-xl font-black tracking-tight text-red-500">⚙️ 중앙 관제소</h1>
                  <span className="bg-red-50 text-red-600 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider">Admin Only</span>
                </div>
                
                <div className="space-y-4">
                  <h3 className="font-black text-sm text-slate-800">🚨 긴급 블라인드 검토 대상</h3>
                  {posts.filter(p=>p.reportedBy?.length>=3).length === 0 ? (
                    <div className="p-6 bg-green-50/50 text-green-700 rounded-2xl border border-green-100 text-xs font-bold text-center">클린합니다! 3회 이상 신고된 악성 피드가 없습니다.</div>
                  ) : posts.filter(p=>p.reportedBy?.length>=3).map(p=>(
                    <div key={p.id} className="p-4 border border-red-100 rounded-2xl bg-red-50/30 flex justify-between items-center gap-4 text-xs font-bold">
                      <div className="truncate flex-1">[{p.category}] {p.title} <span className="text-red-500 ml-2 bg-white px-2 py-0.5 rounded-lg shadow-sm">누적 신고: {p.reportedBy.length}회</span></div>
                      <button onClick={async ()=>{ 
                        if (window.confirm("즉시 폭파하시겠습니까?")) {
                          setPosts((prev: any[]) => prev.filter(post=>post.id!==p.id)); 
                          if(p.id >= 10000) await supabase.from('deals').delete().eq('id', p.id - 10000);
                        }
                      }} className="px-4 py-2 bg-red-600 text-white rounded-xl text-[11px] hover:bg-red-700 shadow-sm shrink-0">블라인드</button>
                    </div>
                  ))}
                </div>

                {/* [수정됨] 메인 배너 이미지 파일 직접 첨부 기능 탑재 완료 */}
                <div className="pt-8 border-t border-slate-100 space-y-4">
                  <h3 className="font-black text-sm text-slate-800">🖼️ 메인 로비 배너 제어</h3>
                  <div className="bg-slate-50 border border-slate-100 p-5 md:p-6 rounded-3xl space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">배너 이미지 파일 업로드 (직접 첨부)</label>
                      <input type="file" accept="image/*" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setBannerFile(file);
                          const reader = new FileReader();
                          reader.onloadend = () => setAdminBannerImg(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }} className="w-full p-3 bg-white border border-dashed border-slate-200 rounded-2xl text-xs cursor-pointer mb-3" />
                      
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">또는 배너 이미지 URL 주소 (기존 방식)</label>
                      <input type="text" placeholder="https://..." value={adminBannerImg.startsWith('data:image') ? "" : adminBannerImg} onChange={e=>{ setAdminBannerImg(e.target.value); setBannerFile(null); }} className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">클릭 시 이동할 링크 URL</label>
                      <input type="text" placeholder="https://..." value={adminBannerLink} onChange={e=>setAdminBannerLink(e.target.value)} className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none" />
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                        <input type="checkbox" checked={adminBannerActive} onChange={e=>setAdminBannerActive(e.target.checked)} className="w-4 h-4 accent-slate-900" /> 메인 화면에 배너 노출
                      </label>
                      <button onClick={async ()=>{ 
                        let finalUrl = adminBannerImg;
                        if (bannerFile) {
                          const fileExt = bannerFile.name.split('.').pop();
                          const fileName = `banner_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
                          const { error: uploadError } = await supabase.storage.from('images').upload(fileName, bannerFile);
                          if (!uploadError) {
                            const { data } = supabase.storage.from('images').getPublicUrl(fileName);
                            finalUrl = data.publicUrl;
                            setAdminBannerImg(finalUrl);
                          } else {
                            alert("배너 이미지 업로드에 실패했습니다.");
                            return;
                          }
                        }
                        setMainBanner({ imageUrl: finalUrl, targetLink: adminBannerLink, isActive: adminBannerActive }); 
                        setBannerFile(null);
                        alert("로비 배너 교체 완료!"); 
                      }} className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-bold hover:bg-slate-800 shadow-sm">저장 및 적용</button>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-100 space-y-4">
                  <h3 className="font-black text-sm text-slate-800">📂 피드 카테고리(말머리) 제어</h3>
                  <select value={adminEditCat} onChange={e=>setAdminEditCat(e.target.value)} className="w-full p-3.5 border border-slate-200 rounded-2xl text-sm font-bold bg-white focus:outline-none shadow-sm cursor-pointer">
                    {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="p-4 bg-blue-50/50 text-blue-800 rounded-2xl border border-blue-100 text-xs font-bold overflow-x-auto whitespace-nowrap scrollbar-hide shadow-sm flex items-center gap-2">
                    <span className="bg-blue-600 text-white px-2 py-1 rounded-lg">현재 상태</span> {subCategories[adminEditCat]?.join("  →  ")}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-3">
                      <b className="text-xs block text-slate-700">➕ 말머리 추가</b>
                      <input type="text" value={adminAddSubInput} onChange={e=>setAdminAddSubInput(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs focus:outline-none" placeholder="새로운 이름" />
                      <button onClick={()=>{
                        if(!adminAddSubInput) return; 
                        if(subCategories[adminEditCat].includes(adminAddSubInput)) return alert("이미 존재합니다.");
                        const newArr = [...subCategories[adminEditCat]]; const endIdx = newArr.indexOf("종료"); 
                        if(endIdx !== -1) newArr.splice(endIdx, 0, adminAddSubInput); else newArr.push(adminAddSubInput);
                        setSubCategories((prev: any) => ({...prev, [adminEditCat]: newArr})); setAdminAddSubInput(""); alert("추가 완료!");
                      }} className="w-full py-3 bg-slate-900 text-white rounded-2xl text-xs font-bold hover:bg-slate-800 transition-colors">추가 실행</button>
                    </div>

                    <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-3">
                      <b className="text-xs block text-slate-700">📝 말머리 변경</b>
                      <select value={adminRenameTarget} onChange={e=>setAdminRenameTarget(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs focus:outline-none cursor-pointer">
                        <option value="선택안함">기존 대상 선택</option>
                        {subCategories[adminEditCat]?.filter((s:any)=>s!=="전체"&&s!=="종료").map((s:any)=><option key={s} value={s}>{s}</option>)}
                      </select>
                      <input type="text" value={adminRenameInput} onChange={e=>setAdminRenameInput(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs focus:outline-none" placeholder="바꿀 이름" />
                      <button onClick={()=>{
                        if(adminRenameTarget==="선택안함" || !adminRenameInput) return alert("입력 오류"); 
                        if(subCategories[adminEditCat].includes(adminRenameInput)) return alert("중복 발생");
                        setSubCategories((prev: any) => ({ ...prev, [adminEditCat]: prev[adminEditCat].map((s:any)=>s===adminRenameTarget ? adminRenameInput : s) }));
                        setPosts((prev: any[]) => prev.map(p=>(p.category===adminEditCat && p.subCategory===adminRenameTarget) ? {...p, subCategory: adminRenameInput} : p)); alert("변경 완료!");
                      }} className="w-full py-3 bg-slate-900 text-white rounded-2xl text-xs font-bold hover:bg-slate-800 transition-colors">변경 실행</button>
                    </div>

                    <div className="bg-white p-5 rounded-3xl border border-red-100 shadow-sm space-y-3">
                      <b className="text-xs block text-red-600">🗑️ 말머리 삭제</b>
                      <select value={adminDelTarget} onChange={e=>setAdminDelTarget(e.target.value)} className="w-full p-3 bg-red-50/30 border border-red-100 text-red-700 rounded-2xl text-xs focus:outline-none cursor-pointer">
                        <option value="선택안함">삭제 대상 선택</option>
                        {subCategories[adminEditCat]?.filter((s:any)=>s!=="전체"&&s!=="종료").map((s:any)=><option key={s} value={s}>{s}</option>)}
                      </select>
                      <div className="h-[42px]"></div>
                      <button onClick={()=>{
                        if(adminDelTarget==="선택안함") return alert("선택하세요");
                        setSubCategories((prev: any) => ({ ...prev, [adminEditCat]: prev[adminEditCat].filter((s:any)=>s!==adminDelTarget) }));
                        setPosts((prev: any[]) => prev.map(p=>(p.category===adminEditCat && p.subCategory===adminDelTarget) ? {...p, subCategory: "일반"} : p)); alert("삭제 완료!");
                      }} className="w-full py-3 bg-red-600 text-white rounded-2xl text-xs font-bold hover:bg-red-700 transition-colors">영구 삭제</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div> 
        </div> 
    </>
  );
}