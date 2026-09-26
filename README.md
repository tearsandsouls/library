# 그을린 흔적의 서재 · GitHub Pages + Supabase

사이트 코드는 GitHub Pages, 로그인은 Supabase Auth, 원고는 PostgreSQL, 미디어는 비공개 Supabase Storage에 저장합니다. 새 계정 최초 로그인 시 가상의 작품 **안개 항구의 편지**, **새벽의 기록**이 한 번만 생성됩니다. 기존 원고는 업로드하지 않습니다.

## 최초 설정 (Supabase 프로젝트가 아직 없는 경우)

1. https://supabase.com/dashboard 에서 새 프로젝트를 만듭니다. DB 비밀번호는 본인이 보관하고 코드·채팅·GitHub에 넣지 않습니다.
2. 프로젝트의 SQL Editor에서 `supabase/setup.sql` 전체를 실행합니다. 테이블, 계정별 RLS, 비공개 미디어 버킷, 더미데이터 초기화 함수를 만듭니다.
3. Authentication → Users에서 본인이 사용할 이메일과 비밀번호로 사용자를 추가하고 이메일 확인 상태로 만듭니다. 개인용이면 새 사용자 가입을 비활성화합니다. 사이트는 공개 회원가입 기능을 제공하지 않습니다.
4. 프로젝트 Connect / API Keys에서 **Project URL**과 **Publishable key**를 확인합니다. `sb_secret_...` 및 `service_role` 키는 사용하지 않습니다.
5. GitHub 저장소 `tearsandsouls/library` → Settings → Secrets and variables → Actions → **Variables**에 다음 두 Repository variables를 만듭니다.
   - `SUPABASE_URL`: `https://프로젝트ID.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY`: 공개 Publishable key
6. Settings → Pages → Source를 **GitHub Actions**로 선택합니다.
7. Actions → Deploy library to GitHub Pages → Run workflow를 실행합니다. 기본 주소는 `https://tearsandsouls.github.io/library/`입니다. 배포 성공은 Actions에서 확인합니다.
8. 사이트에서 3번에 만든 계정으로 로그인합니다. 더미데이터는 로그인한 본인 계정으로 DB에 삽입됩니다. 다른 계정에서는 서로의 데이터를 볼 수 없습니다.

설정 전에도 빌드는 가능하며, 로그인 화면에 Supabase 설정 안내가 나옵니다. 공개 키는 브라우저에 노출되는 것이 정상이며, 접근 권한은 RLS가 제한합니다.

## 로컬 실행

Node.js 22 이상을 사용합니다.

```sh
npm ci
npm test
npm run build
python3 -m http.server 8000 --directory dist
```

로컬 연결 값은 `assets/js/config.js`의 빈 두 값에 넣습니다. GitHub Actions의 Repository variables는 빌드 때 이 파일을 대신 생성합니다. HTML을 파일로 직접 열지 말고 웹서버로 실행하세요.

## 기존 브라우저 데이터 삭제

이 버전은 기존 데이터를 이전하지 않습니다. 인증 및 더미데이터 준비가 성공한 뒤 **현재 사이트 주소의** 아래 저장 항목만 삭제합니다.

- 기존 작품 본문·목록·시리즈·샘플 정보 및 기존 원고별 저장 키
- 이전 앱의 IndexedDB `storyloom_media_v1`

다른 앱 데이터와 Supabase 로그인 토큰은 삭제하지 않습니다. 브라우저 보안상 GitHub Pages에서는 과거 localhost나 다른 도메인의 저장소를 지울 수 없습니다. 그 데이터는 해당 주소의 브라우저 사이트 데이터 설정에서 별도로 삭제해야 합니다. 이전 앱 탭이 DB 삭제를 막으면 그 탭을 닫고 다시 로그인하세요.

## 데이터와 저장

`library_documents`는 `owner_id + key`로 구분하는 JSONB 문서 테이블입니다. 작품 목록·시리즈 및 작품별 에피소드→회차→Scene 구조를 기존 형태로 보존합니다. `revision`을 비교하여 다른 기기에서 저장된 내용을 조용히 덮어쓰지 않습니다. 최초 더미데이터 삽입은 트랜잭션이며 중복 실행해도 원고를 초기화하지 않습니다.

이미지/GIF/영상은 `library-media/<계정 ID>/<미디어 ID>`에 저장합니다. 비공개 다운로드에 로그인 권한을 사용합니다. 기본 파일 제한은 50 MiB이고 JPEG, PNG, GIF, WebP, AVIF, MP4, WebM, QuickTime을 허용합니다. 영상 재생은 브라우저가 지원하는 코덱에 따라 달라집니다. 더미데이터는 텍스트 원고와 설정이며 가짜 미디어 파일은 만들지 않습니다.

입력 후 자동 저장하며 화면 상단에서 클라우드 저장 완료를 확인할 수 있습니다. 실패하면 현재 탭에서 원고를 유지하고 재시도를 제공합니다. 충돌 시 현재 원고를 복사해 보관한 뒤 새로고침하여 서버의 최신 내용을 확인하세요. 오프라인 영구 저장 기능은 없으므로 저장되지 않은 상태에서 탭을 강제로 닫으면 변경분을 잃을 수 있습니다.

## 검증 범위

`npm test`: 저장 큐, 네트워크 실패/재시도, 동시 편집 충돌, 파일 삭제 순서, 더미 계층 및 PostgreSQL RLS 테스트.
RLS 테스트는 PGlite에서 Supabase의 auth/storage 인터페이스를 모사합니다. 실제 프로젝트 생성 후 Auth·Storage·배포 연결은 별도로 확인해야 합니다.
