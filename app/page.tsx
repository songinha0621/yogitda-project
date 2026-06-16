"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Head from 'next/head';

const SUPABASE_URL = "https://ntlxfdwpldcnsklmddzd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bHhmZHdwbGRjbnNrbG1kZHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjkyNTEsImV4cCI6MjA5NjUwNTI1MX0.TDwHNCITp08CXHmxyvO2haDgPMNbAXetFDwViATuJkI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function Home() {
  const [currentView, setCurrentView] = useState("로비");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [focusPostId, setFocusPostId] = useState<number | null>(null);
  const [writingCategory, setWritingCategory] = useState("");
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [selectedTargetUser, setSelectedTargetUser] = useState<string>(""); 

  // 🚨 아까 길을 잃었던 상태(State)들을 컴포넌트 최상단으로 무사히 구출했습니다!
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
    imageUrl: "https://dummyimage.com/1600x300/475569/f8fafc&text=[Grand+Open]+Yogitda+Top+3+Event!",
    targetLink: "https://naver.com",
    isActive: true
  });

  const [posts, setPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // 🚀 서버 사이드 페이지네이션을 위한 전체 페이지 수 상태
  const [totalPages, setTotalPages] = useState(1);

  // 🚀 강력해진 SSR 맞춤형 데이터 패칭 엔진
  const fetchTargetData = async () => {
    setIsLoading(true);
    try {
      // 1. 프로필 정보 항상 최신화
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

      // 2. 현재 화면(View)에 딱 맞는 데이터만 수파베이스에 요청
      let query = supabase.from('deals').select('*', { count: 'exact' });

      if (CATEGORIES.includes(currentView) && !focusPostId) {
        // [카테고리 리스트] - 필요한 8개만 쏙 빼오기
        query = query.eq('category', currentView);
        const isClosable = !["공지사항", "요청"].includes(currentView);
        const todayStr = new Date().toISOString().split('T')[0];

        // 상태(종료여부) 필터링 서버 위임
        if (isClosable) {
          if (selectedSub === "종료") {
            query = query.or(`status.eq.종료,end_date.lt.${todayStr}`);
          } else {
            query = query.neq('status', '종료').gte('end_date', todayStr);
            if (selectedSub !== "전체") query = query.eq('sub_category', selectedSub);
          }
        } else {
          if (selectedSub !== "전체") query = query.eq('sub_category', selectedSub);
        }

        // 검색어 서버 연동
        if (activeSearch) {
          query = query.or(`title.ilike.%${activeSearch}%,content.ilike.%${activeSearch}%`);
        }

        // 정렬 조건 서버 연동
        if (sortOption === "조회순") {
          query = query.order('views', { ascending: false });
        } else if (sortOption === "추천순") {
          query = query.order('upvotes', { ascending: false });
        } else {
          query = query.order('id', { ascending: false });
        }

        // 🚨 핵심: 페이지 구간 끊어오기 (.range)
        const from = (currentPage - 1) * 8;
        const to = from + 8 - 1;
        query = query.range(from, to);

      } else if (focusPostId) {
        // [상세글 보기] - 딱 1개만 가져오기
        query = query.eq('id', focusPostId - 10000);
      } else {
        // [로비 랭킹 / 마이페이지 / 유저 조회] - 분석용 200개 뭉치만 최신순 로드
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
          endDate: item.end_date || "2026-12-31", 
          status: item.status || "진행중", 
          comments: item.comments || [],
          mallName: item.mall_name || "", 
          price: item.price || "", 
          shipping: item.shipping || ""
        }));
        
        setPosts(mappedPosts);
        
        // 전체 글 갯수 기반으로 총 페이지 수 계산
        if (CATEGORIES.includes(currentView) && !focusPostId && count !== null) {
          setTotalPages(Math.ceil(count / 8) || 1);
        }

        // 주소창 공유 접속 시 팝업 로직
        setTimeout(() => {
          if (typeof window !== "undefined" && !focusPostId) {
            const urlParams = new URLSearchParams(window.location.search);
            const postIdFromUrl = urlParams.get('post');
            if (postIdFromUrl && currentView === "로비") {
              const targetPostId = parseInt(postIdFromUrl, 10);
              setFocusPostId(targetPostId);
              // (주의: 다이렉트 링크의 경우 DB에서 카테고리를 알아야 완벽하지만 우선 상세뷰는 띄움)
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

  // 🚀 유저가 게시판 필터, 페이지, 검색을 바꿀 때마다 알아서 서버에서 다시 가져옴 (핵심 트리거)
  useEffect(() => {
    fetchTargetData();
  }, [currentView, selectedSub, sortOption, activeSearch, currentPage, focusPostId, auth.userId]);


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
    if (error) console.error("DB 업데이트 실패:", error);
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
  
  const [commentInput, setCommentInput] = useState(""); const [replyInputs, setReplyInputs] = useState<any>({}); const [replyOpen, setReplyOpen] = useState<any>({});
  const [adminBannerImg, setAdminBannerImg] = useState(mainBanner.imageUrl); const [adminBannerLink, setAdminBannerLink] = useState(mainBanner.targetLink); const [adminBannerActive, setAdminBannerActive] = useState(mainBanner.isActive);
  const [adminEditCat, setAdminEditCat] = useState("옷"); const [adminAddSubInput, setAdminAddSubInput] = useState(""); const [adminRenameTarget, setAdminRenameTarget] = useState("선택안함"); const [adminRenameInput, setAdminRenameInput] = useState(""); const [adminDelTarget, setAdminDelTarget] = useState("선택안함");
  
  const navigate = (view: string) => { 
    setCurrentView(view); setFocusPostId(null); setActiveSearch(""); setSearchQuery(""); setSelectedSub("전체"); setCurrentPage(1); window.scrollTo(0,0); 
    
    if (typeof window !== "undefined") window.history.pushState({}, '', '/'); 

    if (view === "글쓰기") { 
      setWriteImages([]); 
      setWriteFiles([]); 
      setWriteTitle(""); 
      setWriteContent(""); 
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
    setFocusPostId(postId);
    setCurrentView(cat);
    
    if (typeof window !== "undefined") window.history.pushState({}, '', `?post=${postId}`);
    
    window.scrollTo(0,0);
  };

  const handleAuthorClick = (authorId: string) => {
    setSelectedTargetUser(authorId);
    setCurrentView("작성자 조회");
    setFocusPostId(null);
    window.scrollTo(0,0);
  };

  const addNotify = async (targetUser: string, text: string, postId: number) => {
    const timeStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
    await supabase.from('notifications').insert([{ target_user: targetUser, text, post_id: postId, time: timeStr, read: false }]);
  };

  const handleMultiImageUpload = (e: any) => { 
    const files = Array.from(e.target.files) as File[];
    setWriteFiles((prev: File[]) => [...prev, ...files]);

    files.forEach(file => {
      const reader = new FileReader(); 
      reader.onloadend = () => {
        setWriteImages((prev: string[]) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const saveProfileInfo = async () => {
    if (!userProfile.nickname.trim()) {
      return alert("닉네임을 입력해주세요.");
    }

    const { data: existingUser } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('nickname', userProfile.nickname)
      .neq('user_id', auth.userId)
      .maybeSingle();

    if (existingUser) {
      return alert("🚨 이미 다른 분이 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.");
    }

    const { error } = await supabase.from('profiles').upsert([{
      user_id: auth.userId,
      nickname: userProfile.nickname,
      share_posts: userProfile.sharePosts,
      share_comments: userProfile.shareComments
    }]);

    if (error) {
      alert("설정 저장에 실패했습니다.");
    } else {
      alert("내 정보 및 공개 설정이 성공적으로 적용되었습니다.");
      fetchTargetData(); 
    }
  };

  const handleBannerUpload = (e: any) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setAdminBannerImg(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const isValidForRanking = (p: any) => { try { if (!p.time || !p.endDate) return false; const pTime = new Date(p.time.replace(' ', 'T')).getTime(); const pEnd = new Date(p.endDate).getTime(); const sevenDaysAgo = Date.now() - 7 * 86400000; const today = new Date().setHours(0,0,0,0); return pTime >= sevenDaysAgo && p.status !== "종료" && pEnd >= today; } catch(e) { return false; } };

  const getUserDisplayName = (userId: string) => profilesDb[userId]?.nickname || userId;

  // 🚀 모바일에 맞춘 반응형 CSS 스타일로 전면 교체
  const styles = {
    container: "w-full px-4 md:w-[85%] md:px-0 mx-auto pt-6 md:pt-[4.5rem] pb-[3rem] font-sans text-slate-900 bg-white min-h-screen",
    primaryButton: "bg-slate-600 text-white border border-slate-600 py-2 px-4 rounded flex justify-center items-center h-full w-full font-bold shadow-sm transition-colors duration-150 text-sm md:text-base whitespace-nowrap",
    secondaryButton: "bg-white border border-slate-300 text-slate-600 py-2 px-4 rounded hover:bg-blue-50 hover:text-blue-600 hover:border-blue-400 transition-colors duration-150 flex justify-center items-center h-full w-full font-bold text-sm md:text-base whitespace-nowrap",
    tertiaryButton: "bg-transparent border-none text-slate-700 hover:text-blue-600 hover:underline transition-colors duration-150 p-0 m-0 text-left justify-start w-full text-[14px] md:text-[15px]"
  };

  return (
    <>
      <Head>
        <title>요깄다 - 내가 찾던 핫딜, 할인</title>
      </Head>

      <div className={styles.container}>
        
        {toast.show && (
          <div className="fixed bottom-10 right-4 md:right-10 bg-slate-800 text-white px-6 py-4 rounded-xl shadow-2xl z-50 animate-bounce">
            <b className="text-yellow-400">🔔 알림:</b> {toast.message}
          </div>
        )}

        {/* 상단 헤더 (모바일 반응형 스택 구조 적용) */}
        {!["글쓰기", "글수정", "회원가입", "비밀번호찾기", "로그인"].includes(currentView) && (
          <div className="mb-4">
            <header className="flex flex-col md:flex-row w-full items-center mb-4 gap-3 md:gap-4 md:h-[40px]">
              <div className="w-full md:w-auto flex-shrink-0 flex justify-center md:block">
                <button onClick={() => navigate("로비")} className={currentView === "로비" ? styles.primaryButton : styles.secondaryButton}>📍 요깄다</button>
              </div>
              <div className="w-full md:flex-1 md:px-2 h-[40px]">
                <input 
                  type="text" 
                  placeholder="놓친 핫딜이나 혜택을 검색 (엔터)" 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  onKeyDown={(e) => { 
                    if (e.key === 'Enter') { setActiveSearch(searchQuery); if(currentView === "로비") navigate("핫딜 커뮤니티"); } 
                  }} 
                  className="w-full h-full p-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow text-sm" 
                />
              </div>
              
              <div className="w-full md:w-auto flex items-center justify-start md:justify-end gap-2 overflow-x-auto whitespace-nowrap pb-2 md:pb-0 scrollbar-hide h-[40px]">
                {!auth.loggedIn ? (
                  <>
                    <button onClick={() => navigate("로그인")} className={currentView === "로그인" ? styles.primaryButton : styles.secondaryButton}>로그인</button>
                    <button onClick={() => navigate("회원가입")} className={currentView === "회원가입" ? styles.primaryButton : styles.secondaryButton}>회원가입</button>
                  </>
                ) : (
                  <>
                    <div className="text-sm px-2 flex items-center gap-1 font-bold text-slate-800">
                      {auth.userRole === "admin" ? "👑 " : "👤 "}{userProfile.nickname}님
                    </div>
                    <button onClick={() => navigate("알림")} className={currentView === "알림" ? styles.primaryButton : styles.secondaryButton}>🔔 {notifications[auth.userId]?.filter((n:any)=>!n.read).length > 0 ? `(${notifications[auth.userId].filter((n:any)=>!n.read).length})` : ""}</button>
                    <button onClick={() => navigate("마이페이지")} className={currentView === "마이페이지" ? styles.primaryButton : styles.secondaryButton}>마이페이지</button>
                    {auth.userRole === "admin" && <button onClick={() => navigate("사이트 관리")} className={currentView === "사이트 관리" ? styles.primaryButton : styles.secondaryButton}>{posts.some(p => p.reportedBy?.length >= 3) ? "🚨 관리" : "⚙️ 관리"}</button>}
                    <button onClick={async () => { await supabase.auth.signOut(); navigate("로비"); }} className={styles.secondaryButton}>로그아웃</button>
                  </>
                )}
              </div>
            </header>

            <hr className="border-t border-slate-200 my-4" />

            {/* 네비게이션 가로 스크롤 적용 (모바일에서 넘치지 않음) */}
            <nav className="flex w-full gap-2 overflow-x-auto whitespace-nowrap pb-2 scrollbar-hide">
              {CATEGORIES.map((cat) => {
                const targetCat = cat === "공지사항" ? "공지사항" : cat;
                let hasNew = false;
                try { hasNew = posts.some(p => p.category === targetCat && p.time && (Date.now() - new Date(p.time.replace(' ', 'T')).getTime()) / 3600000 <= 6); } catch(e) {}
                
                return (
                  <div key={cat} className="flex-shrink-0 min-w-[80px]">
                    <button onClick={() => navigate(cat)} className={currentView === cat ? styles.primaryButton : styles.secondaryButton}>{hasNew ? `${cat} 🔹` : cat}</button>
                  </div>
                );
              })}
            </nav>
            <hr className="border-t border-slate-200 my-4" />
          </div>
        )}

        <div className="w-full max-w-5xl mx-auto">
            {isLoading && (
              <p className="text-center p-8 text-slate-500 font-bold text-sm md:text-base">데이터를 스마트하게 불러오는 중... ⏳</p>
            )}

            {/* 🔑 로그인 */}
            {currentView === "로그인" && (
              <div className="w-full md:max-w-md md:mx-auto">
                <h1 className="text-2xl md:text-3xl font-bold mb-4">🔑 로그인</h1>
                <p className="mb-4 text-sm md:text-base">요깄다에 오신 것을 환영합니다!</p>
                <hr className="mb-4 border-slate-200"/>
                
                <div className="border border-slate-300 p-4 md:p-6 rounded mb-4">
                  <div className="flex gap-2 md:gap-3 mb-6">
                    <button onClick={() => handleSocialLogin('kakao')} className="flex-1 bg-[#FEE500] text-black font-bold py-2 md:py-3 rounded-lg shadow-sm hover:opacity-90 transition-opacity text-sm">💬 카카오 시작</button>
                    <button onClick={() => handleSocialLogin('naver')} className="flex-1 bg-[#03C75A] text-white font-bold py-2 md:py-3 rounded-lg shadow-sm hover:opacity-90 transition-opacity text-sm">N 네이버 시작</button>
                  </div>
                  
                  <div className="flex items-center gap-4 mb-6">
                    <hr className="flex-1 border-slate-200" /><span className="text-slate-400 text-xs md:text-sm whitespace-nowrap">또는 이메일로 로그인</span><hr className="flex-1 border-slate-200" />
                  </div>

                  <label className="block mb-2 text-sm font-bold">네이버 이메일 주소</label>
                  <input type="text" placeholder="예: example@naver.com" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} className="w-full p-2 border border-slate-300 rounded mb-4 focus:ring-2 focus:ring-blue-400 focus:outline-none transition-shadow text-sm" />
                  
                  <label className="block mb-2 text-sm font-bold">비밀번호</label>
                  <div className="relative mb-6">
                    <input type={showLoginPw ? "text" : "password"} placeholder="비밀번호를 입력하세요" value={loginPw} onChange={e=>setLoginPw(e.target.value)} className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-400 focus:outline-none transition-shadow pr-10 text-sm" />
                    <button type="button" onClick={() => setShowLoginPw(!showLoginPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 font-bold">
                      {showLoginPw ? "🙈" : "👁️"}
                    </button>
                  </div>
                  
                  <div className="flex flex-col gap-2 h-auto">
                    <button onClick={async ()=>{
                      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPw });
                      if (error) alert("🚨 이메일 또는 비밀번호가 일치하지 않습니다.");
                      else navigate("로비");
                    }} className={styles.primaryButton}>🚀 일반 로그인</button>
                    <button onClick={()=>navigate("로비")} className={styles.secondaryButton}>⬅️ 로비로 이동</button>
                  </div>
                </div>
                
                <p className="text-xs md:text-sm text-slate-500 mb-4 text-center">아직 회원이 아니신가요? 비밀번호를 잊으셨나요?</p>
                <div className="flex gap-2">
                  <button onClick={()=>navigate("회원가입")} className={`${styles.secondaryButton} flex-1`}>📝 회원가입</button>
                  <button onClick={()=>navigate("비밀번호찾기")} className={`${styles.secondaryButton} flex-1`}>🔍 비밀번호 찾기</button>
                </div>
              </div>
            )}

            {/* 📝 회원가입 */}
            {currentView === "회원가입" && (
              <div className="w-full md:max-w-md md:mx-auto">
                <h1 className="text-2xl md:text-3xl font-bold mb-4">📝 회원가입</h1>
                <hr className="mb-4 border-slate-200"/>
                
                <div className="border border-slate-300 p-4 md:p-6 rounded mb-4 space-y-4">
                  <div className="flex gap-2 md:gap-3 mb-2">
                    <button onClick={() => handleSocialLogin('kakao')} className="flex-1 bg-[#FEE500] text-black font-bold py-2 md:py-3 rounded-lg shadow-sm hover:opacity-90 transition-opacity text-sm">💬 카카오 시작</button>
                    <button onClick={() => handleSocialLogin('naver')} className="flex-1 bg-[#03C75A] text-white font-bold py-2 md:py-3 rounded-lg shadow-sm hover:opacity-90 transition-opacity text-sm">N 네이버 시작</button>
                  </div>
                  
                  <div className="flex items-center gap-4 py-2">
                    <hr className="flex-1 border-slate-200" /><span className="text-slate-400 text-xs md:text-sm whitespace-nowrap">또는 네이버 메일로 가입</span><hr className="flex-1 border-slate-200" />
                  </div>

                  <div>
                    <label className="block text-sm mb-1 font-bold">네이버 이메일</label>
                    <input type="text" value={regEmail} onChange={e=>setRegEmail(e.target.value)} className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-400 focus:outline-none transition-shadow text-sm" placeholder="예: example@naver.com" />
                    <p className="text-xs text-red-500 mt-1">※ 안전을 위해 오직 @naver.com 메일만 허용됩니다.</p>
                  </div>
                  <div>
                    <label className="block text-sm mb-1 font-bold">비밀번호</label>
                    <div className="relative">
                      <input type={showRegPw ? "text" : "password"} value={regPw} onChange={e=>setRegPw(e.target.value)} className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-400 focus:outline-none transition-shadow pr-10 text-sm" placeholder="영문, 숫자, 특수기호 포함" />
                      <button type="button" onClick={() => setShowRegPw(!showRegPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 font-bold">
                        {showRegPw ? "🙈" : "👁️"}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm mb-1 font-bold">비밀번호 확인</label>
                    <div className="relative">
                      <input type={showRegPwChk ? "text" : "password"} value={regPwChk} onChange={e=>setRegPwChk(e.target.value)} className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-400 focus:outline-none transition-shadow pr-10 text-sm" placeholder="비밀번호 재입력" />
                      <button type="button" onClick={() => setShowRegPwChk(!showRegPwChk)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 font-bold">
                        {showRegPwChk ? "🙈" : "👁️"}
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2 h-auto">
                  <button onClick={async ()=>{
                    const hasEng = /[a-zA-Z]/.test(regPw); const hasNum = /\d/.test(regPw); const hasSpecial = /[!@#$%^&*()_\-+=\[\]{};':"\\|,.<>\/?]/.test(regPw);
                    if (!regEmail || !regPw) return alert("이메일과 비밀번호를 모두 입력해주세요.");
                    if (!regEmail.endsWith("@naver.com")) return alert("🚨 네이버 이메일(@naver.com)만 가입 가능합니다.");
                    if (!(hasEng && hasNum && hasSpecial)) return alert("🚨 비밀번호 조건을 만족하지 않습니다.");
                    if (regPw !== regPwChk) return alert("🚨 두 비밀번호가 일치하지 않습니다.");
                    const { error } = await supabase.auth.signUp({ email: regEmail, password: regPw });
                    if (error) alert("회원가입 실패 (이미 가입된 이메일일 수 있습니다): " + error.message);
                    else { alert(`🎉 가입이 완료되었습니다!\n(만약 수파베이스 이메일 인증이 켜져있다면, 메일함에서 인증 링크를 클릭한 후 로그인해주세요.)`); navigate("로그인"); }
                  }} className={styles.primaryButton}>🚀 가입 완료하기</button>
                  <button onClick={()=>navigate("로비")} className={styles.secondaryButton}>⬅️ 취소</button>
                </div>
              </div>
            )}

            {/* 🔍 진짜 비밀번호 찾기 */}
            {currentView === "비밀번호찾기" && (
              <div className="w-full md:max-w-md md:mx-auto">
                <h1 className="text-2xl md:text-3xl font-bold mb-4">🔍 비밀번호 찾기</h1><hr className="mb-4 border-slate-200"/>
                <div className="border border-slate-300 p-4 md:p-6 rounded mb-4 space-y-4">
                  <div className="p-3 md:p-4 bg-blue-50 text-blue-800 rounded font-bold mb-4 text-sm">
                    가입하실 때 사용한 네이버 이메일 주소를 입력하시면 비밀번호 재설정 링크를 보내드립니다.
                  </div>
                  <div>
                    <label className="block text-sm mb-1 font-bold">가입한 네이버 이메일</label>
                    <input type="text" value={findEmail} onChange={e=>setFindEmail(e.target.value)} className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-400 focus:outline-none transition-shadow text-sm" placeholder="예: example@naver.com" />
                  </div>
                  <div className="h-10 mt-6">
                    <button onClick={async ()=>{
                      if (!findEmail.endsWith("@naver.com")) return alert("네이버 이메일 형식이 올바르지 않습니다.");
                      const { error } = await supabase.auth.resetPasswordForEmail(findEmail, { redirectTo: window.location.origin });
                      if (error) alert("이메일 발송 실패: " + error.message);
                      else alert(`✅ [${findEmail}] 메일함으로 비밀번호 재설정 링크가 발송되었습니다.`);
                    }} className={styles.primaryButton}>✉️ 비밀번호 재설정 메일 보내기</button>
                  </div>
                </div>
                <div className="h-10">
                  <button onClick={()=>navigate("로그인")} className={styles.secondaryButton}>⬅️ 로그인으로 돌아가기</button>
                </div>
              </div>
            )}

            {/* 🔔 알림 센터 */}
            {currentView === "알림" && (
              <div>
                {!auth.loggedIn ? (
                  <div className="p-4 bg-yellow-100 text-yellow-800 border rounded font-bold text-sm md:text-base">로그인이 필요한 서비스입니다.</div>
                ) : (
                  <>
                    <h1 className="text-2xl md:text-3xl font-bold mb-4">🔔 알림 센터</h1>
                    <p className="mb-4 text-sm md:text-base">내 게시글에 달린 반응을 확인하세요.</p>
                    <hr className="mb-4 border-slate-200"/>
                    {(!notifications[auth.userId] || notifications[auth.userId].length === 0) ? (
                      <div className="p-4 bg-blue-100 text-blue-800 border rounded font-bold text-sm md:text-base">새로운 알림이 없습니다.</div>
                    ) : (
                      <>
                        <div className="mb-4">
                          <button onClick={async ()=>{ 
                            setNotifications((prev:any)=>({...prev, [auth.userId]: prev[auth.userId].map((n:any)=>({...n, read:true}))}));
                            await supabase.from('notifications').update({ read: true }).eq('target_user', auth.userId);
                          }} className="w-full md:w-auto px-4 py-2 bg-slate-600 text-white hover:bg-slate-700 rounded transition-colors font-bold text-sm">
                            모두 읽음 처리 (확인)
                          </button>
                        </div>
                        <div className="space-y-3 md:space-y-4">
                          {notifications[auth.userId].map((n:any)=>(
                            <div key={n.id} className="border border-slate-300 p-3 md:p-4 rounded hover:bg-slate-50 transition-colors">
                              <p className="font-bold text-slate-800 text-sm md:text-base">{!n.read && <span className="text-red-500">🔴 [NEW] </span>}{n.text}</p>
                              <p className="text-xs md:text-sm text-slate-500 mt-2">🕒 {n.time}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 📢 로비 */}
            {currentView === "로비" && !isLoading && (
              <div className="w-full md:w-[75%] mx-auto">
                <h4 className="text-base md:text-lg font-bold mb-4 text-slate-800">📢 내가 찾던 페이백, 할인 요깄다! [요깄다]</h4>
                
                {mainBanner.isActive && (
                  <a href={mainBanner.targetLink} target="_blank" rel="noreferrer" className="block w-full mb-6">
                    <img src={mainBanner.imageUrl} className="w-full h-auto max-h-[150px] md:max-h-[300px] rounded-xl md:rounded-[16px] object-cover shadow-sm hover:opacity-90 transition-opacity" alt="banner" />
                  </a>
                )}
                <hr className="mb-4 border-slate-200"/>
                
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 border border-slate-300 p-4 rounded bg-white shadow-sm hover:shadow-md transition-shadow">
                    <h4 className="font-bold text-base md:text-lg mb-4 text-slate-800 border-b pb-2">📊 실시간 할인 랭킹 &gt;</h4>
                    {(() => {
                      const validDisc = posts.filter(p => ["옷","음식","여가","쇼핑","여행"].includes(p.category) && p.author === "ext9999" && isValidForRanking(p)).sort((a,b)=>b.upvotes-a.upvotes).slice(0,3);
                      if (validDisc.length === 0) return <p className="text-slate-500 text-xs md:text-sm">7일 내 등록된 활성 할인 정보가 없습니다.</p>;
                      return validDisc.map((p, idx) => (
                        <div key={p.id} className="mb-2">
                          <button onClick={()=>handleViewPost(p.id, p.category)} className={styles.tertiaryButton}>
                            <span className="truncate block">👉 {idx+1}. [{p.category}] {p.title} <span className="text-slate-500 font-normal">(👍 {p.upvotes})</span></span>
                          </button>
                        </div>
                      ));
                    })()}
                  </div>
                  <div className="flex-1 border border-slate-300 p-4 rounded bg-white shadow-sm hover:shadow-md transition-shadow">
                    <button onClick={()=>navigate("핫딜 커뮤니티")} className="w-full text-left font-bold text-base md:text-lg mb-4 text-red-600 border-b pb-2 hover:text-red-700">
                      🔥 실시간 핫딜 랭킹 &gt;
                    </button>
                    {(() => {
                      const validHot = posts.filter(p => p.category === "핫딜 커뮤니티" && isValidForRanking(p)).sort((a,b)=>(b.thermoVotes?.hot||0)-(a.thermoVotes?.hot||0)).slice(0,3);
                      if (validHot.length === 0) return <p className="text-slate-500 text-xs md:text-sm">7일 내 등록된 활성 핫딜 정보가 없습니다.</p>;
                      return validHot.map((p, idx) => (
                        <div key={p.id} className="mb-2">
                          <button onClick={()=>handleViewPost(p.id, p.category)} className={styles.tertiaryButton}>
                            <span className="truncate block">👉 {idx+1}. {p.mallName ? `[${p.mallName}] ` : ""}{p.title} <span className="text-slate-500 font-normal">(🔥 {p.thermoVotes?.hot||0})</span></span>
                          </button>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* 📂 카테고리 홈 & 리스트 */}
            {CATEGORIES.includes(currentView) && !focusPostId && (
              <div>
                <div className="flex flex-col md:flex-row mb-4 items-start md:items-center justify-between gap-2">
                  <h3 className="text-lg md:text-xl font-bold text-slate-800">📂 카테고리 홈 &gt; {currentView}</h3>
                  {(auth.userRole === "admin" || ["핫딜 커뮤니티", "요청"].includes(currentView)) && (
                    <div className="w-full md:w-auto h-[36px]">
                      <button onClick={()=>{ setWritingCategory(currentView); setWriteSubCat("일반"); navigate("글쓰기"); }} className={styles.primaryButton}>📝 글쓰기</button>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 md:gap-4 mb-4 bg-slate-50 p-2 md:p-3 rounded border border-slate-200 overflow-x-auto whitespace-nowrap scrollbar-hide">
                  {subCategories[currentView]?.map((sub: string) => (
                    <label key={sub} className={`flex-shrink-0 flex items-center gap-1 cursor-pointer text-xs md:text-sm font-bold px-3 py-1.5 md:py-1 rounded-full transition-colors ${selectedSub === sub ? "bg-slate-600 text-white" : "bg-white border text-slate-600 hover:bg-blue-50 hover:text-blue-600"}`}>
                      <input type="radio" checked={selectedSub === sub} onChange={() => { setSelectedSub(sub); setCurrentPage(1); }} className="hidden" /> {sub}
                    </label>
                  ))}
                </div>

                <div className="flex mb-4 justify-end">
                  <div className="w-full md:w-[150px]">
                    <select value={sortOption} onChange={(e) => { setSortOption(e.target.value); setCurrentPage(1); }} className="w-full p-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow">
                      <option value="최신순">최신순</option>
                      <option value="조회순">조회순</option>
                      <option value="추천순">추천순</option>
                    </select>
                  </div>
                </div>

                <div>
                  {posts.length > 0 && <div className="border-t-2 border-slate-600 mb-2"></div>}
                  
                  {!isLoading && posts.length === 0 ? (
                    <p className="p-8 border border-slate-300 text-center text-slate-500 rounded text-sm md:text-base">해당하는 게시글이 없습니다.</p>
                  ) : posts.map(p => {
                    let isExp = false;
                    try { isExp = p.status === "종료" || new Date(p.endDate) < new Date(new Date().setHours(0,0,0,0)); } catch(e) {}
                    const expTag = (isExp && selectedSub !== "종료") ? <span className="text-red-500 mr-1">[종료]</span> : "";
                    const hasImg = p.image || (p.images && p.images.length > 0);
                    const imgIcon = hasImg ? " 🖼️" : "";
                    
                    let titleStr = `[${p.subCategory || "일반"}] ${expTag}${currentView==="핫딜 커뮤니티" && p.mallName ? `[${p.mallName}] ` : ""}${p.title}${imgIcon}`;
                    if (currentView === "핫딜 커뮤니티" && p.price) titleStr += ` (${p.price} / ${p.shipping})`;
                    
                    return (
                      <div key={p.id} className="hover:bg-blue-50 transition-colors duration-150 rounded px-2 -mx-2">
                        <div className="flex flex-col md:flex-row py-2 md:py-3 md:items-center">
                          <div className="w-full md:w-3/4 mb-1 md:mb-0">
                            <button onClick={()=>handleViewPost(p.id, p.category)} className={styles.tertiaryButton} style={{fontWeight: 'bold'}}>
                              {titleStr}
                            </button>
                          </div>
                          <div className="w-full md:w-1/4 flex items-center justify-start md:justify-end text-[11px] md:text-[13px] text-slate-500 gap-2 md:gap-1 flex-wrap">
                            <button onClick={() => handleAuthorClick(p.author)} className="font-bold text-slate-700 hover:underline hover:text-blue-600 truncate max-w-[80px]">
                              {getUserDisplayName(p.author)}
                            </button> 
                            <span>| 🕒 {p.time ? p.time.split(' ')[0] : ""}</span> 
                            <span>| 👀 {p.views}</span> 
                            <span>| {currentView==="핫딜 커뮤니티" ? `🔥 ${p.thermoVotes?.hot||0}` : `👍 ${p.upvotes}`}</span>
                          </div>
                        </div>
                        <hr className="m-0 border-t border-slate-200" />
                      </div>
                    );
                  })}
                  
                  <div className="flex gap-2 mt-6 justify-center flex-wrap">
                     {Array.from({length: totalPages}, (_,i)=>i+1).map(pageNum => (
                       <div key={pageNum} className="w-[36px] md:w-[40px] h-[36px] md:h-[40px]">
                         <button onClick={()=>setCurrentPage(pageNum)} className={currentPage === pageNum ? styles.primaryButton : styles.secondaryButton}>
                           {pageNum}
                         </button>
                       </div>
                     ))}
                  </div>
                </div>
              </div>
            )}

            {/* 🔍 게시글 상세 보기 */}
            {CATEGORIES.includes(currentView) && focusPostId && (
              (() => {
                const post = posts.find(p => p.id === focusPostId);
                if (!post) return <div className="p-4 bg-red-100 border border-red-300 text-red-700 rounded mb-4 text-sm md:text-base">게시글을 불러오고 있거나 존재하지 않습니다. <button onClick={()=>navigate(currentView)} className="underline ml-4 font-bold">목록으로</button></div>;
                
                let isExpired = false;
                try { isExpired = (!["공지사항", "요청"].includes(currentView)) && (new Date(post.endDate) < new Date(new Date().setHours(0,0,0,0)) || post.status === "종료"); } catch(e){}
                const isHot = currentView === "핫딜 커뮤니티";

                return (
                  <div className="bg-white border border-slate-200 p-4 md:p-8 rounded-xl shadow-sm">
                    <div className="h-10 w-full md:w-auto mb-4">
                      <button onClick={()=>navigate(currentView)} className={styles.primaryButton}>⬅️ 목록으로 돌아가기</button>
                    </div>
                    <hr className="my-4 border-slate-200" />
                    
                    <h1 className="text-xl md:text-2xl font-bold mb-4 text-slate-800 leading-snug">
                      {isExpired && <span className="text-red-500">🔴[종료] </span>}
                      [{post.subCategory||"일반"}] {post.title}
                    </h1>
                    
                    {isHot && post.mallName && (
                      <h5 className="font-bold mb-4 text-xs md:text-sm bg-slate-50 border p-3 rounded text-slate-700 flex flex-wrap gap-2">
                        <span>🛒 쇼핑몰: {post.mallName}</span>
                        <span>| 💰 가격: <span className="text-red-500">{post.price}</span></span>
                        <span>| 🚚 배송비: {post.shipping}</span>
                      </h5>
                    )}
                    
                    <div className="flex flex-col md:flex-row text-xs md:text-sm text-slate-500 mb-4 gap-2 md:gap-0 items-start md:items-center">
                      <div className="w-full md:flex-1 flex items-center gap-1 flex-wrap">
                        <button onClick={() => handleAuthorClick(post.author)} className="font-bold text-slate-800 hover:underline hover:text-blue-600">
                          {getUserDisplayName(post.author)}
                        </button>
                        &nbsp;|&nbsp; 🕒 {post.time} &nbsp;|&nbsp; 👀 조회수: {post.views}
                      </div>
                      {post.link && (
                        <div className="w-full md:w-auto h-9 md:h-10 mt-2 md:mt-0">
                          <a href={post.link} target="_blank" rel="noreferrer" className={isExpired ? "flex justify-center items-center h-full px-4 bg-slate-200 border border-slate-300 text-slate-500 rounded pointer-events-none text-xs md:text-sm font-bold" : "flex justify-center items-center h-full px-4 bg-blue-500 hover:bg-blue-600 transition-colors text-white rounded text-xs md:text-sm font-bold shadow-sm"}>
                            🔗 관련 링크 이동
                          </a>
                        </div>
                      )}
                    </div>
                    
                    <hr className="mb-4 border-slate-200" />
                    
                    <div className="flex flex-col gap-4 mb-4">
                      {post.images && post.images.length > 0 ? (
                        post.images.map((imgUrl: string, idx: number) => (
                          <img key={idx} src={imgUrl} className="w-full rounded shadow-sm object-contain" alt={`attachment-${idx}`} />
                        ))
                      ) : (
                        post.image && <img src={post.image} className="w-full rounded shadow-sm object-contain" alt="attachment-legacy" />
                      )}
                    </div>

                    <div className="whitespace-pre-wrap leading-relaxed text-[14px] md:text-[15px] mb-6 text-slate-800 break-words overflow-hidden">{post.content}</div>
                    
                    <hr className="mb-4 border-slate-200" />

                    <div className="flex flex-wrap gap-2 mb-4 h-auto md:h-10">
                      {isHot ? (
                        <>
                          <div className="w-[31%] md:flex-1 h-10">
                            <button onClick={() => {
                              if(!auth.loggedIn) return alert("로그인 필요");
                              let newV = { ...(post.thermoVotes || {hot:0,soso:0,cold:0}) };
                              let newBy = { ...(post.thermoVotedBy || {}) };
                              let newUpvotes = post.upvotes;
                              
                              if(newBy[auth.userId] === "hot") { newV.hot--; delete newBy[auth.userId]; newUpvotes--; } 
                              else { if(newBy[auth.userId]) newV[newBy[auth.userId]]--; newV.hot++; newBy[auth.userId]="hot"; newUpvotes++; }
                              
                              setPosts((prev: any[]) => prev.map(p=> p.id===post.id ? {...p, thermoVotes: newV, thermoVotedBy: newBy, upvotes: newUpvotes} : p));
                              syncUpdateToDB(post.id, { thermoVotes: newV, thermoVotedBy: newBy, upvotes: newUpvotes });
                            }} className={post.thermoVotedBy?.[auth.userId]==="hot" ? "bg-orange-500 text-white font-bold rounded flex justify-center items-center h-full w-full shadow-sm text-xs md:text-sm" : `${styles.secondaryButton} text-xs md:text-sm px-1`}>
                              🔥 역대급 ({post.thermoVotes?.hot||0})
                            </button>
                          </div>
                          <div className="w-[31%] md:flex-1 h-10">
                            <button onClick={() => {
                              if(!auth.loggedIn) return alert("로그인 필요");
                              let newV = { ...(post.thermoVotes || {hot:0,soso:0,cold:0}) };
                              let newBy = { ...(post.thermoVotedBy || {}) };
                              if(newBy[auth.userId] === "soso") { newV.soso--; delete newBy[auth.userId]; } 
                              else { if(newBy[auth.userId]) newV[newBy[auth.userId]]--; newV.soso++; newBy[auth.userId]="soso"; }
                              setPosts((prev: any[]) => prev.map(p=> p.id===post.id ? {...p, thermoVotes: newV, thermoVotedBy: newBy} : p));
                              syncUpdateToDB(post.id, { thermoVotes: newV, thermoVotedBy: newBy });
                            }} className={post.thermoVotedBy?.[auth.userId]==="soso" ? "bg-slate-600 text-white font-bold rounded flex justify-center items-center h-full w-full shadow-sm text-xs md:text-sm" : `${styles.secondaryButton} text-xs md:text-sm px-1`}>
                              🤔 애매함 ({post.thermoVotes?.soso||0})
                            </button>
                          </div>
                          <div className="w-[31%] md:flex-1 h-10">
                            <button onClick={() => {
                              if(!auth.loggedIn) return alert("로그인 필요");
                              let newV = { ...(post.thermoVotes || {hot:0,soso:0,cold:0}) };
                              let newBy = { ...(post.thermoVotedBy || {}) };
                              if(newBy[auth.userId] === "cold") { newV.cold--; delete newBy[auth.userId]; } 
                              else { if(newBy[auth.userId]) newV[newBy[auth.userId]]--; newV.cold++; newBy[auth.userId]="cold"; }
                              setPosts((prev: any[]) => prev.map(p=> p.id===post.id ? {...p, thermoVotes: newV, thermoVotedBy: newBy} : p));
                              syncUpdateToDB(post.id, { thermoVotes: newV, thermoVotedBy: newBy });
                            }} className={post.thermoVotedBy?.[auth.userId]==="cold" ? "bg-blue-500 text-white font-bold rounded flex justify-center items-center h-full w-full shadow-sm text-xs md:text-sm" : `${styles.secondaryButton} text-xs md:text-sm px-1`}>
                              🥶 비쌈 ({post.thermoVotes?.cold||0})
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="w-full md:flex-1 h-10">
                          <button onClick={() => {
                            if(!auth.loggedIn) return alert("로그인 필요");
                            const isUp = post.upvotedBy?.includes(auth.userId);
                            const newUps = isUp ? post.upvotes - 1 : post.upvotes + 1;
                            const newUpBy = isUp ? post.upvotedBy.filter((u:any)=>u!==auth.userId) : [...(post.upvotedBy||[]), auth.userId];
                            setPosts((prev: any[]) => prev.map(p=>p.id===post.id ? {...p, upvotes: newUps, upvotedBy: newUpBy} : p));
                            syncUpdateToDB(post.id, { upvotes: newUps, upvotedBy: newUpBy });
                          }} className={post.upvotedBy?.includes(auth.userId) ? styles.primaryButton : styles.secondaryButton}>
                            {post.upvotedBy?.includes(auth.userId) ? `👍 추천 취소 (${post.upvotes})` : `👍 추천 (${post.upvotes})`}
                          </button>
                        </div>
                      )}
                      
                      <div className="w-[48%] md:flex-1 h-10">
                        <button onClick={() => {
                          if(!auth.loggedIn) return alert("로그인 필요");
                          const isScrap = post.scrappedBy?.includes(auth.userId);
                          const newScrap = isScrap ? post.scrappedBy.filter((u:any)=>u!==auth.userId) : [...(post.scrappedBy||[]), auth.userId];
                          setPosts((prev: any[]) => prev.map(p=>p.id===post.id ? {...p, scrappedBy: newScrap} : p));
                          syncUpdateToDB(post.id, { scrappedBy: newScrap });
                        }} className={post.scrappedBy?.includes(auth.userId) ? "bg-yellow-400 text-slate-800 font-bold rounded flex justify-center items-center h-full w-full shadow-sm text-xs md:text-sm" : `${styles.secondaryButton} text-xs md:text-sm`}>
                          {post.scrappedBy?.includes(auth.userId) ? "🌟 스크랩 취소" : "⭐ 스크랩"}
                        </button>
                      </div>
                      
                      <div className="w-[48%] md:flex-1 h-10">
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
                        }} className="bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 flex justify-center items-center h-full w-full font-bold transition-colors text-xs md:text-sm">
                          🚨 신고 ({post.reportedBy?.length||0})
                        </button>
                      </div>
                      
                      {(auth.userRole === "admin" || auth.userId === post.author) && (
                        <>
                          <div className="w-[48%] md:flex-1 h-10">
                            <button onClick={()=>{
                              setWriteTitle(post.title); setWriteContent(post.content); setWriteLink(post.link); setWriteImages(post.images || []); setWriteEndDate(post.endDate||""); setWriteMall(post.mallName||""); setWritePrice(post.price||""); setWriteShipping(post.shipping||"무료배송"); setEditingPostId(post.id); setCurrentView("글수정"); window.scrollTo(0,0);
                            }} className="bg-amber-500 hover:bg-amber-600 text-white font-bold rounded flex justify-center items-center h-full w-full transition-colors text-xs md:text-sm">
                              📝 수정
                            </button>
                          </div>
                          <div className="w-[48%] md:flex-1 h-10">
                            <button onClick={async ()=>{ 
                              if (window.confirm("정말로 이 게시글을 삭제하시겠습니까?\n삭제된 글은 복구할 수 없습니다.")) {
                                setPosts((prev: any[]) => prev.filter(p=>p.id!==post.id)); 
                                if (post.id >= 10000) await supabase.from('deals').delete().eq('id', post.id - 10000);
                                navigate(currentView); 
                              }
                            }} className="bg-red-600 hover:bg-red-700 text-white font-bold rounded flex justify-center items-center h-full w-full transition-colors text-xs md:text-sm">
                              🗑️ 삭제
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <hr className="mb-6 border-slate-200" />
                    <h4 className="font-bold text-base md:text-lg mb-4 text-slate-800">💬 댓글 ({post.comments?.length || 0})</h4>
                    <div className="mb-6">
                      {post.comments?.map((cmt: any) => (
                        <div key={cmt.id} className="mb-4 bg-slate-50 border border-slate-200 p-3 md:p-4 rounded-lg">
                          <div className="text-[13px] md:text-[14px] text-slate-800 flex items-center gap-1 flex-wrap">
                            <button onClick={() => handleAuthorClick(cmt.user)} className="font-bold text-slate-700 hover:underline hover:text-blue-600">
                              {getUserDisplayName(cmt.user)}
                            </button>: {cmt.text} <span className="text-slate-400 text-[10px] md:text-xs ml-1 md:ml-2">({cmt.time})</span>
                            
                            {(auth.userId === cmt.user || auth.userRole === "admin") && (
                              <button onClick={() => {
                                if (window.confirm("정말로 이 댓글을 삭제하시겠습니까?")) {
                                  const newComments = post.comments.filter((c:any) => c.id !== cmt.id);
                                  setPosts((prev: any[]) => prev.map(p => p.id === post.id ? {...p, comments: newComments} : p));
                                  syncUpdateToDB(post.id, { comments: newComments });
                                }
                              }} className="text-[10px] md:text-xs text-red-500 hover:text-red-700 ml-2 font-bold">
                                [삭제]
                              </button>
                            )}
                          </div>
                          
                          {cmt.replies?.map((rep: any, rIdx: number) => (
                            <div key={rIdx} className="ml-4 md:ml-6 mt-2 text-[12px] md:text-[13px] border-l-2 border-slate-300 pl-2 md:pl-3 text-slate-700 flex items-center gap-1 flex-wrap">
                              ↳ <button onClick={() => handleAuthorClick(rep.user)} className="font-bold text-slate-600 hover:underline hover:text-blue-600">
                                {getUserDisplayName(rep.user)}
                              </button>: {rep.text} <span className="text-slate-400 text-[10px] md:text-xs ml-1 md:ml-2">({rep.time})</span>
                              
                              {(auth.userId === rep.user || auth.userRole === "admin") && (
                                <button onClick={() => {
                                  if (window.confirm("정말로 이 답글을 삭제하시겠습니까?")) {
                                    const newReplies = cmt.replies.filter((_:any, idx:number) => idx !== rIdx);
                                    const newComments = post.comments.map((c:any) => c.id === cmt.id ? {...c, replies: newReplies} : c);
                                    setPosts((prev: any[]) => prev.map(p => p.id === post.id ? {...p, comments: newComments} : p));
                                    syncUpdateToDB(post.id, { comments: newComments });
                                  }
                                }} className="text-[10px] md:text-xs text-red-500 hover:text-red-700 ml-2 font-bold">
                                  [삭제]
                                </button>
                              )}
                            </div>
                          ))}
                          
                          {auth.loggedIn && (
                            <div className="ml-4 md:ml-6 mt-3">
                              <button onClick={()=>setReplyOpen((prev:any)=>({...prev, [`${post.id}_${cmt.id}`]: !prev[`${post.id}_${cmt.id}`]}))} className="text-[11px] md:text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors mb-2">
                                ↳ '{getUserDisplayName(cmt.user)}'님에게 답글 달기
                              </button>
                              
                              {replyOpen[`${post.id}_${cmt.id}`] && (
                                <div className="flex flex-col md:flex-row gap-2">
                                  <div className="w-full md:flex-1 h-9">
                                    <input type="text" placeholder="답글 내용" value={replyInputs[`${post.id}_${cmt.id}`] || ""} onChange={(e)=>setReplyInputs({...replyInputs, [`${post.id}_${cmt.id}`]: e.target.value})} className="w-full h-full p-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow" />
                                  </div>
                                  <div className="w-full md:w-[80px] h-9">
                                    <button onClick={()=>{
                                      if(!replyInputs[`${post.id}_${cmt.id}`]) return;
                                      const newComments = post.comments.map((c:any)=>c.id===cmt.id ? {...c, replies: [...(c.replies||[]), {user: auth.userId, text: replyInputs[`${post.id}_${cmt.id}`], time: new Date().toISOString().replace('T', ' ').slice(0, 16)}]} : c);
                                      setPosts((prev: any[]) => prev.map(p=>p.id===post.id ? {...p, comments: newComments} : p));
                                      syncUpdateToDB(post.id, { comments: newComments });
                                      setReplyInputs({...replyInputs, [`${post.id}_${cmt.id}`]: ""}); 
                                      setReplyOpen((prev:any)=>({...prev, [`${post.id}_${cmt.id}`]: false})); 
                                      addNotify(cmt.user, "새로운 답글이 달렸습니다.", post.id);
                                    }} className={styles.primaryButton} style={{fontSize:'12px'}}>답글 등록</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    {auth.loggedIn && (
                      <div className="border-t border-slate-200 pt-4">
                        <p className="font-bold mb-2 text-xs md:text-sm text-slate-800">새 댓글 작성</p>
                        <div className="flex flex-col md:flex-row gap-2">
                          <div className="w-full md:w-4/5 h-10">
                            <input type="text" placeholder="타인을 존중하는 깨끗한 댓글 문화를 만듭시다." value={commentInput} onChange={(e)=>setCommentInput(e.target.value)} className="w-full h-full p-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow text-sm" />
                          </div>
                          <div className="w-full md:w-1/5 h-10">
                            <button onClick={()=>{
                              if(!commentInput) return;
                              const newComments = [...(post.comments||[]), {id: Date.now(), user: auth.userId, text: commentInput, time: new Date().toISOString().replace('T', ' ').slice(0, 16), replies: []}];
                              setPosts((prev: any[]) => prev.map(p=>p.id===post.id ? {...p, comments: newComments} : p));
                              syncUpdateToDB(post.id, { comments: newComments });
                              setCommentInput(""); 
                              addNotify(post.author, "게시글에 새 댓글이 달렸습니다.", post.id); 
                            }} className={styles.primaryButton}>댓글 등록</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            )}

            {/* 🚀 신규: 작성자 활동 조회 화면 */}
            {currentView === "작성자 조회" && (
              <div className="bg-white border border-slate-200 p-4 md:p-8 rounded-xl shadow-sm">
                <h1 className="text-xl md:text-2xl font-bold mb-4 text-slate-800">👤 {getUserDisplayName(selectedTargetUser)} 님의 활동 조회</h1>
                <div className="h-10 mb-6 w-[120px] md:max-w-[150px]">
                  <button onClick={() => navigate("로비")} className={styles.secondaryButton}>⬅️ 로비로 이동</button>
                </div>
                <hr className="mb-6 border-slate-200"/>

                <div className="space-y-6">
                  <div>
                    <h3 className="font-bold text-base md:text-lg mb-2 text-slate-800">📝 작성한 게시글 목록</h3>
                    {profilesDb[selectedTargetUser]?.share_posts ? (
                      (() => {
                        const userPosts = posts.filter(p => p.author === selectedTargetUser);
                        if(userPosts.length === 0) return <p className="text-xs md:text-sm text-slate-500 p-2">작성한 글이 없습니다.</p>;
                        return userPosts.map(p => (
                          <div key={p.id} onClick={() => handleViewPost(p.id, p.category)} className="border border-slate-300 p-3 rounded-lg bg-slate-50 mb-2 hover:bg-blue-50 cursor-pointer text-sm md:text-base">
                            <b>[{p.category}]</b> {p.title}
                          </div>
                        ));
                      })()
                    ) : (
                      <div className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-lg text-xs md:text-sm font-bold">🔒 작성자가 게시글 조회를 비허용(비공개)했습니다.</div>
                    )}
                  </div>

                  <div>
                    <h3 className="font-bold text-base md:text-lg mb-2 text-slate-800">💬 작성한 댓글 목록</h3>
                    {profilesDb[selectedTargetUser]?.share_comments ? (
                      (() => {
                        const userCmts: any[] = [];
                        posts.forEach(p => {
                          p.comments?.forEach((c: any) => {
                            if(c.user === selectedTargetUser) userCmts.push({ post: p, cmt: c });
                          });
                        });
                        if(userCmts.length === 0) return <p className="text-xs md:text-sm text-slate-500 p-2">작성한 댓글이 없습니다.</p>;
                        return userCmts.map((item, idx) => (
                          <div key={idx} onClick={() => handleViewPost(item.post.id, item.post.category)} className="border border-slate-300 p-3 rounded-lg bg-slate-50 mb-2 hover:bg-blue-50 cursor-pointer text-sm md:text-base">
                            <b>💬 {item.cmt.text}</b>
                            <p className="text-[11px] md:text-xs text-slate-400 mt-1">원문: {item.post.title}</p>
                          </div>
                        ));
                      })()
                    ) : (
                      <div className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-lg text-xs md:text-sm font-bold">🔒 작성자가 댓글 조회를 비허용(비공개)했습니다.</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ✍️ 글쓰기 */}
            {currentView === "글쓰기" && (
              <div className="border border-slate-300 p-4 md:p-8 rounded-xl bg-white shadow-sm mb-4">
                <h1 className="text-2xl font-bold mb-6 text-slate-800">✍️ [{writingCategory}] 글 작성하기</h1>
                
                <label className="block mb-2 font-bold text-sm text-slate-700">분류(말머리)</label>
                <select value={writeSubCat} onChange={e=>setWriteSubCat(e.target.value)} className="w-full p-2 border border-slate-300 rounded mb-6 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow bg-white">
                  {subCategories[writingCategory]?.filter((s:any)=>s!=="전체"&&s!=="종료").map((s:any)=><option key={s} value={s}>{s}</option>) || <option value="일반">일반</option>}
                </select>
                
                {writingCategory === "핫딜 커뮤니티" && (
                  <div className="flex flex-col md:flex-row gap-4 mb-6">
                    <div className="w-full md:flex-1">
                      <label className="block font-bold mb-1 text-sm text-slate-700">🏢 쇼핑몰 이름</label>
                      <input type="text" value={writeMall} onChange={e=>setWriteMall(e.target.value)} className="w-full p-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow" placeholder="예: 쿠팡"/>
                    </div>
                    <div className="w-full md:flex-1">
                      <label className="block font-bold mb-1 text-sm text-slate-700">💰 할인가격</label>
                      <input type="text" value={writePrice} onChange={e=>setWritePrice(e.target.value)} className="w-full p-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow" placeholder="예: 150,000원"/>
                    </div>
                    <div className="w-full md:flex-1">
                      <label className="block font-bold mb-1 text-sm text-slate-700">🚚 배송비</label>
                      <select value={writeShipping} onChange={e=>setWriteShipping(e.target.value)} className="w-full p-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow bg-white">
                        <option value="무료배송">무료배송</option><option value="유료배송">유료배송</option><option value="조건부 무료">조건부 무료</option><option value="기타">기타</option>
                      </select>
                    </div>
                  </div>
                )}
                
                <label className="block mb-1 font-bold text-sm text-slate-700">글 제목</label>
                <input type="text" value={writeTitle} onChange={e=>setWriteTitle(e.target.value)} className="w-full p-2 border border-slate-300 rounded mb-6 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow" placeholder="제목을 입력하세요"/>
                
                <label className="block mb-1 font-bold text-sm text-slate-700">글 내용</label>
                <textarea rows={8} value={writeContent} onChange={e=>setWriteContent(e.target.value)} className="w-full p-2 border border-slate-300 rounded mb-6 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow" placeholder="내용을 입력하세요"/>
                
                <label className="block mb-1 font-bold text-sm text-slate-700">📷 사진 첨부 (여러 장 선택 가능)</label>
                <input type="file" multiple accept="image/jpeg, image/png, image/jpg" onChange={handleMultiImageUpload} className="w-full p-2 border border-slate-300 rounded mb-2 text-sm bg-slate-50"/>
                
                {writeImages.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto mb-6 p-2 border border-slate-200 rounded scrollbar-hide">
                    {writeImages.map((img, idx) => (
                      <div key={idx} className="relative w-20 h-20 flex-shrink-0 border rounded overflow-hidden">
                        <img src={img} className="w-full h-full object-cover" alt="preview" />
                        <button onClick={() => {
                          setWriteImages((prev: string[]) => prev.filter((_, i) => i !== idx));
                          setWriteFiles((prev: File[]) => prev.filter((_, i) => i !== idx)); 
                        }} className="absolute top-0 right-0 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-bl font-bold">X</button>
                      </div>
                    ))}
                  </div>
                )}
                
                <label className="block mb-1 font-bold text-sm text-slate-700 mt-4">🔗 관련 링크 주소</label>
                <input type="text" value={writeLink} onChange={e=>setWriteLink(e.target.value)} className="w-full p-2 border border-slate-300 rounded mb-6 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow" placeholder="URL을 입력하세요"/>
                
                {!["공지사항", "요청"].includes(writingCategory) && (
                  <div>
                    <label className="block font-bold mb-1 text-sm text-slate-700">📆 핫딜/할인 마감일</label>
                    <input type="date" value={writeEndDate} onChange={e=>setWriteEndDate(e.target.value)} className="w-full p-2 border border-slate-300 rounded mb-6 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow bg-white"/>
                  </div>
                )}
                
                <div className="h-12">
                  <button disabled={isUploading} onClick={async ()=>{
                    if(!writeTitle || !writeContent) return alert("제목과 내용을 모두 채워주세요!");
                    
                    setIsUploading(true);
                    const uploadedUrls: string[] = [];

                    for (const file of writeFiles) {
                      const fileExt = file.name.split('.').pop();
                      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

                      const { error: uploadError } = await supabase.storage.from('images').upload(fileName, file);

                      if (!uploadError) {
                        const { data } = supabase.storage.from('images').getPublicUrl(fileName);
                        uploadedUrls.push(data.publicUrl);
                      } else {
                        console.error("업로드 에러:", uploadError);
                      }
                    }
                    
                    const { error } = await supabase.from('deals').insert([{ 
                      title: writeTitle, 
                      content: writeContent, 
                      price: writePrice, 
                      url: writeLink, 
                      category: writingCategory, 
                      sub_category: writeSubCat, 
                      author: auth.userId || "익명회원", 
                      mall_name: writeMall, 
                      shipping: writeShipping, 
                      end_date: writeEndDate,
                      image: uploadedUrls[0] || null, 
                      images: uploadedUrls 
                    }]);
                    
                    setIsUploading(false);

                    if(error) { 
                      console.warn(error); 
                      alert("서버 오류가 발생했습니다."); 
                    } else { 
                      alert("✅ 성공적으로 게시글이 등록되었습니다."); 
                      fetchTargetData(); 
                      navigate(writingCategory);
                    }
                  }} className={styles.primaryButton}>{isUploading ? "⏳ 사진 업로드 중..." : "🚀 게시글 등록"}</button>
                </div>
              </div>
            )}

            {/* 📝 글수정 */}
            {currentView === "글수정" && (
              <div className="border border-slate-300 p-4 md:p-8 rounded-xl bg-white shadow-sm mb-4">
                <h1 className="text-2xl font-bold mb-6 text-slate-800">📝 글 수정하기</h1>
                {(() => {
                  const post_to_edit = posts.find((p:any) => p.id === editingPostId);
                  if(!post_to_edit) return null;
                  return (
                    <div className="space-y-6">
                      {post_to_edit.category === "핫딜 커뮤니티" && (
                        <div className="flex flex-col md:flex-row gap-4 mb-4">
                          <div className="w-full md:flex-1">
                            <label className="block font-bold mb-1 text-sm text-slate-700">🏢 쇼핑몰 이름</label>
                            <input type="text" value={writeMall} onChange={e=>setWriteMall(e.target.value)} className="w-full p-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow"/>
                          </div>
                          <div className="w-full md:flex-1">
                            <label className="block font-bold mb-1 text-sm text-slate-700">💰 할인가격</label>
                            <input type="text" value={writePrice} onChange={e=>setWritePrice(e.target.value)} className="w-full p-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow"/>
                          </div>
                          <div className="w-full md:flex-1">
                            <label className="block font-bold mb-1 text-sm text-slate-700">🚚 배송비</label>
                            <select value={writeShipping} onChange={e=>setWriteShipping(e.target.value)} className="w-full p-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow bg-white">
                              <option value="무료배송">무료배송</option><option value="유료배송">유료배송</option><option value="조건부 무료">조건부 무료</option><option value="기타">기타</option>
                            </select>
                          </div>
                        </div>
                      )}
                      
                      <div>
                        <label className="block font-bold mb-1 text-sm text-slate-700">글 제목</label>
                        <input type="text" value={writeTitle} onChange={e=>setWriteTitle(e.target.value)} className="w-full p-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow"/>
                      </div>
                      
                      <div>
                        <label className="block font-bold mb-1 text-sm text-slate-700">글 내용</label>
                        <textarea rows={8} value={writeContent} onChange={e=>setWriteContent(e.target.value)} className="w-full p-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow"/>
                      </div>
                      
                      <div>
                        <label className="block font-bold mb-1 text-sm text-slate-700">📷 사진 재첨부 (선택 시 기존 사진 덮어쓰기)</label>
                        <input type="file" multiple accept="image/jpeg, image/png, image/jpg" onChange={handleMultiImageUpload} className="w-full p-2 border border-slate-300 rounded text-sm bg-slate-50"/>
                        
                        {writeImages.length > 0 && (
                          <div className="flex gap-2 overflow-x-auto mt-2 p-2 border border-slate-200 rounded scrollbar-hide">
                            {writeImages.map((img, idx) => (
                              <div key={idx} className="relative w-20 h-20 flex-shrink-0 border rounded overflow-hidden">
                                <img src={img} className="w-full h-full object-cover" alt="preview" />
                                <button onClick={() => {
                                  setWriteImages((prev: string[]) => prev.filter((_, i) => i !== idx));
                                  setWriteFiles((prev: File[]) => prev.filter((_, i) => i !== idx));
                                }} className="absolute top-0 right-0 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-bl font-bold">X</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <div>
                        <label className="block font-bold mb-1 text-sm text-slate-700">🔗 링크</label>
                        <input type="text" value={writeLink} onChange={e=>setWriteLink(e.target.value)} className="w-full p-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow"/>
                      </div>
                      
                      <div>
                        <label className="block font-bold mb-1 text-sm text-slate-700">📆 마감일</label>
                        <input type="date" value={writeEndDate} onChange={e=>setWriteEndDate(e.target.value)} className="w-full p-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow bg-white"/>
                      </div>
                      
                      <div className="h-12 mt-4">
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
                              title: writeTitle, content: writeContent, url: writeLink, mall_name: writeMall, price: writePrice, shipping: writeShipping, end_date: writeEndDate, image: finalUrls[0] || post_to_edit.image, images: writeFiles.length > 0 ? finalUrls : post_to_edit.images
                            }).eq('id', editingPostId - 10000);
                            fetchTargetData();
                          }
                          
                          setIsUploading(false);
                          alert("수정 완료!"); 
                          navigate(post_to_edit.category);
                        }} className={styles.primaryButton}>{isUploading ? "⏳ 업로드 및 수정 중..." : "💾 수정 완료"}</button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* 👤 마이페이지 */}
            {currentView === "마이페이지" && auth.loggedIn && (
              <div className="bg-white border border-slate-200 p-4 md:p-8 rounded-xl shadow-sm">
                <h1 className="text-2xl md:text-3xl font-bold mb-4 text-slate-800">👤 마이페이지</h1>
                
                <div className="mb-8 p-4 md:p-6 bg-slate-50 border border-slate-200 rounded-lg shadow-sm">
                  <h4 className="font-bold text-sm md:text-base mb-3 text-slate-800">🔒 내 활동 내역 공개 범위 설정</h4>
                  <div className="space-y-2 mb-6">
                    <label className="flex items-center gap-2 cursor-pointer text-xs md:text-sm font-semibold text-slate-700">
                      <input type="checkbox" checked={userProfile.sharePosts} onChange={e => setUserProfile({...userProfile, sharePosts: e.target.checked})} className="w-4 h-4 text-slate-600 focus:ring-slate-400" />
                      다른 유저에게 내가 작성한 게시글 목록 공개 허용
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs md:text-sm font-semibold text-slate-700">
                      <input type="checkbox" checked={userProfile.shareComments} onChange={e => setUserProfile({...userProfile, shareComments: e.target.checked})} className="w-4 h-4 text-slate-600 focus:ring-slate-400" />
                      다른 유저에게 내가 작성한 댓글 목록 공개 허용
                    </label>
                    <p className="text-[11px] md:text-xs text-red-500">※ 체크 해제 시 남들이 내 닉네임을 눌러도 활동 내역이 보이지 않습니다.</p>
                  </div>

                  <label className="block text-xs md:text-sm font-bold text-slate-700 mb-1">🏷️ 내 커뮤니티 닉네임 설정</label>
                  <div className="flex flex-col md:flex-row gap-2 h-auto md:h-10">
                    <div className="w-full md:w-4/5 h-10">
                      <input type="text" value={userProfile.nickname} onChange={e => setUserProfile({...userProfile, nickname: e.target.value})} className="border p-2 rounded text-sm w-full h-full focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow"/>
                    </div>
                    <div className="w-full md:w-1/5 h-10">
                      <button onClick={saveProfileInfo} className={styles.primaryButton}>💾 설정 저장</button>
                    </div>
                  </div>
                </div>

                <p className="mb-6 text-sm md:text-base text-slate-600">환영합니다! <b className="text-slate-800">{userProfile.nickname}</b>님의 개인 내부 내역입니다.</p>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
                  {["📝 내가 쓴 글", "💬 내가 쓴 댓글", "👍 추천 내역", "⭐ 스크랩"].map((t, i)=>(
                    <button key={i} onClick={()=>setMyPageTab(i)} className={myPageTab === i ? styles.primaryButton : styles.secondaryButton}>{t}</button>
                  ))}
                </div>
                <div className="space-y-4">
                  {myPageTab === 0 && posts.filter(p=>p.author===auth.userId).map(p=>(
                    <div key={p.id} className="border border-slate-300 p-3 md:p-4 rounded-lg bg-slate-50 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer text-sm md:text-base" onClick={()=>handleViewPost(p.id, p.category)}>
                      <b className="block truncate">[{p.category} &gt; {p.subCategory||"일반"}] {p.title}</b>
                    </div>
                  ))}
                  {myPageTab === 1 && posts.map(p=>p.comments?.filter((c:any)=>c.user===auth.userId).map((c:any)=>(
                    <div key={c.id} className="border border-slate-300 p-3 md:p-4 rounded-lg bg-slate-50 mb-3 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer" onClick={()=>handleViewPost(p.id, p.category)}>
                      <b className="text-sm md:text-base">💬 {c.text}</b><p className="text-xs md:text-sm text-slate-500 mt-2 truncate">원문: [{p.category}] {p.title}</p>
                    </div>
                  )))}
                  {myPageTab === 2 && posts.filter(p=>p.upvotedBy?.includes(auth.userId) || ["hot","soso","cold"].includes(p.thermoVotedBy?.[auth.userId])).map(p=>(
                    <div key={p.id} className="border border-slate-300 p-3 md:p-4 rounded-lg bg-slate-50 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer text-sm md:text-base" onClick={()=>handleViewPost(p.id, p.category)}>
                      <b className="block truncate">[{p.category} &gt; {p.subCategory||"일반"}] {p.title}</b>
                    </div>
                  ))}
                  {myPageTab === 3 && posts.filter(p=>p.scrappedBy?.includes(auth.userId)).map(p=>(
                    <div key={p.id} className="border border-slate-300 p-3 md:p-4 rounded-lg bg-slate-50 flex flex-col md:flex-row justify-between cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors gap-1 md:gap-0 text-sm md:text-base" onClick={()=>handleViewPost(p.id, p.category)}>
                      <b className="block truncate w-full md:w-auto">[{p.category} &gt; {p.subCategory||"일반"}] {p.title}</b>
                      <span className="text-[11px] md:text-sm text-slate-400 whitespace-nowrap">({p.time ? p.time.split(' ')[0] : ""})</span>
                    </div>
                  ))}
                  {myPageTab === 3 && posts.filter(p=>p.scrappedBy?.includes(auth.userId)).length === 0 && (
                    <div className="p-6 border border-slate-300 text-center text-slate-500 rounded-lg text-sm md:text-base">아직 스크랩(북마크)한 게시글이 없습니다.</div>
                  )}
                </div>
              </div>
            )}

            {/* ⚙️ 사이트 관리 */}
            {currentView === "사이트 관리" && auth.userRole === "admin" && (
              <div className="bg-white border border-slate-200 p-4 md:p-8 rounded-xl shadow-sm">
                <h1 className="text-2xl md:text-3xl font-bold mb-6 text-slate-800">⚙️ 요깄다 통합 사이트 관리</h1>
                <hr className="mb-6 border-slate-200"/>
                
                <h3 className="font-bold text-lg md:text-xl mb-4 text-slate-800">🚨 신고 누적 게시글 검토</h3>
                {posts.filter(p=>p.reportedBy?.length>=3).length === 0 ? (
                  <div className="p-5 bg-green-50 text-green-700 border border-green-200 rounded-lg mb-8 font-bold text-sm md:text-base">🎉 현재 3회 이상 신고 접수된 악성 게시글이 없습니다. 클린합니다!</div> 
                ) : (
                  <div className="p-4 md:p-6 bg-yellow-50 border border-yellow-300 rounded-lg mb-8">
                    <p className="font-bold text-yellow-800 mb-4 text-sm md:text-base">🚨 주의: 3회 이상 신고가 누적된 게시글이 {posts.filter(p=>p.reportedBy?.length>=3).length}건 있습니다.</p>
                    {posts.filter(p=>p.reportedBy?.length>=3).map(p=>(
                      <div key={p.id} className="border border-yellow-300 bg-white p-4 mb-3 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center shadow-sm gap-4 md:gap-0">
                        <div className="w-full md:w-auto overflow-hidden">
                          <b className="text-[14px] md:text-[15px] block truncate">[{p.category}] {p.title} <span className="text-red-500 font-bold ml-1 md:ml-2">(신고: {p.reportedBy.length}회)</span></b>
                          <span className="text-xs md:text-sm text-slate-500 mt-1 block truncate">작성자: {p.author} | 내용: {p.content.substring(0,30)}...</span>
                        </div>
                        <button onClick={async ()=>{ 
                          if (window.confirm("🚨 이 게시글을 즉시 삭제(블라인드) 처리하시겠습니까?")) {
                            setPosts((prev: any[]) => prev.filter(post=>post.id!==p.id)); 
                            if(p.id >= 10000) await supabase.from('deals').delete().eq('id', p.id - 10000);
                            alert("성공적으로 삭제되었습니다.");
                          }
                        }} className="w-full md:w-auto px-5 py-2.5 bg-red-600 hover:bg-red-700 transition-colors text-white rounded font-bold text-sm whitespace-nowrap">
                          🗑️ 즉시 삭제 (블라인드)
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <h3 className="font-bold text-lg md:text-xl mb-2 text-slate-800">🖼️ 메인 로비 배너 교체</h3>
                <div className="border border-slate-300 p-4 md:p-6 rounded-lg mb-8 bg-slate-50">
                  <label className="block mb-1 text-xs md:text-sm font-bold text-slate-700">1. 배너 이미지 설정 (URL 입력)</label>
                  <input type="text" placeholder="📷 배너 이미지 URL 주소" value={adminBannerImg} onChange={e=>setAdminBannerImg(e.target.value)} className="w-full p-2 md:p-3 border border-slate-300 rounded-lg mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow" />
                  
                  <label className="block mb-1 text-xs md:text-sm font-bold text-slate-700 mt-4">2. 클릭 시 이동할 링크</label>
                  <input type="text" placeholder="🔗 클릭 시 이동할 이벤트 링크" value={adminBannerLink} onChange={e=>setAdminBannerLink(e.target.value)} className="w-full p-2 md:p-3 border border-slate-300 rounded-lg mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow" />
                  
                  <label className="flex items-center gap-2 mb-6 font-bold text-sm text-slate-700">
                    <input type="checkbox" checked={adminBannerActive} onChange={e=>setAdminBannerActive(e.target.checked)} className="w-4 h-4 cursor-pointer" /> 
                    배너 활성화
                  </label>
                  
                  <div className="h-10 md:h-12">
                    <button onClick={()=>{ setMainBanner({ imageUrl: adminBannerImg, targetLink: adminBannerLink, isActive: adminBannerActive }); alert("적용 완료!"); }} className={styles.primaryButton}>
                      💾 변경사항 저장 및 로비에 적용
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-lg md:text-xl mb-2 text-slate-800">📂 소카테고리(말머리) 통합 관리</h3>
                <select value={adminEditCat} onChange={e=>setAdminEditCat(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg mb-4 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow bg-white">
                  {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <div className="p-4 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg mb-6 font-bold text-xs md:text-sm overflow-x-auto whitespace-nowrap scrollbar-hide">
                  현재 [{adminEditCat}] 게시판의 말머리 목록: {subCategories[adminEditCat]?.join("  |  ")}
                </div>
                
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 bg-slate-50 p-4 md:p-5 rounded-lg border border-slate-200">
                    <b className="block mb-3 text-sm text-slate-800">➕ 새 말머리 추가</b>
                    <input type="text" value={adminAddSubInput} onChange={e=>setAdminAddSubInput(e.target.value)} className="w-full p-2 md:p-3 border border-slate-300 rounded-lg mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow" placeholder="추가할 이름" />
                    <div className="h-10 md:h-12">
                      <button onClick={()=>{
                        if(!adminAddSubInput) return; 
                        if(subCategories[adminEditCat].includes(adminAddSubInput)) return alert("이미 존재합니다.");
                        const newArr = [...subCategories[adminEditCat]]; 
                        const endIdx = newArr.indexOf("종료"); 
                        if(endIdx !== -1) newArr.splice(endIdx, 0, adminAddSubInput); 
                        else newArr.push(adminAddSubInput);
                        setSubCategories((prev: any) => ({...prev, [adminEditCat]: newArr})); 
                        setAdminAddSubInput(""); 
                        alert(`'${adminAddSubInput}' 추가 완료!`);
                      }} className={styles.primaryButton}>추가하기</button>
                    </div>
                  </div>
                  <div className="flex-1 bg-slate-50 p-4 md:p-5 rounded-lg border border-slate-200">
                    <b className="block mb-3 text-sm text-slate-800">📝 말머리 수정</b>
                    <select value={adminRenameTarget} onChange={e=>setAdminRenameTarget(e.target.value)} className="w-full p-2 md:p-3 border border-slate-300 rounded-lg mb-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow">
                      <option value="선택안함">변경할 대상 선택</option>
                      {subCategories[adminEditCat]?.filter((s:any)=>s!=="전체"&&s!=="종료").map((s:any)=><option key={s} value={s}>{s}</option>)}
                    </select>
                    <input type="text" placeholder="새로운 이름 입력" value={adminRenameInput} onChange={e=>setAdminRenameInput(e.target.value)} className="w-full p-2 md:p-3 border border-slate-300 rounded-lg mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow" />
                    <div className="h-10 md:h-12">
                      <button onClick={()=>{
                        if(adminRenameTarget==="선택안함" || !adminRenameInput) return alert("대상과 새 이름을 모두 입력하세요."); 
                        if(subCategories[adminEditCat].includes(adminRenameInput)) return alert("이미 존재하는 이름입니다.");
                        setSubCategories((prev: any) => ({ ...prev, [adminEditCat]: prev[adminEditCat].map((s:any)=>s===adminRenameTarget ? adminRenameInput : s) }));
                        setPosts((prev: any[]) => prev.map(p=>(p.category===adminEditCat && p.subCategory===adminRenameTarget) ? {...p, subCategory: adminRenameInput} : p)); 
                        alert(`'${adminRenameTarget}' ➔ '${adminRenameInput}' 변경 완료!`);
                      }} className={styles.primaryButton}>이름 변경</button>
                    </div>
                  </div>
                  <div className="flex-1 bg-red-50 p-4 md:p-5 rounded-lg border border-red-200">
                    <b className="block mb-3 text-sm text-red-600">🗑️ 말머리 삭제</b>
                    <select value={adminDelTarget} onChange={e=>setAdminDelTarget(e.target.value)} className="w-full p-2 md:p-3 border border-red-300 rounded-lg mb-4 text-sm text-red-700 bg-white focus:outline-none focus:ring-2 focus:ring-red-400 transition-shadow">
                      <option value="선택안함">삭제할 대상 선택</option>
                      {subCategories[adminEditCat]?.filter((s:any)=>s!=="전체"&&s!=="종료").map((s:any)=><option key={s} value={s}>{s}</option>)}
                    </select>
                    <div className="h-10 md:h-12 md:mt-[60px]">
                      <button onClick={()=>{
                        if(adminDelTarget==="선택안함") return alert("대상을 선택하세요.");
                        setSubCategories((prev: any) => ({ ...prev, [adminEditCat]: prev[adminEditCat].filter((s:any)=>s!==adminDelTarget) }));
                        setPosts((prev: any[]) => prev.map(p=>(p.category===adminEditCat && p.subCategory===adminDelTarget) ? {...p, subCategory: "일반"} : p)); 
                        alert(`'${adminDelTarget}' 삭제 완료!`);
                      }} className="bg-red-600 text-white rounded-lg hover:bg-red-700 w-full h-full font-bold transition-colors">삭제하기</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div> {/* w-full max-w-5xl mx-auto 닫기 */}
        </div> {/* styles.container 닫기 */}
    </>
  );
}