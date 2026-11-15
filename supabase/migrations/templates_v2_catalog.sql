alter table public.templates add column if not exists spec jsonb;
alter table public.templates add column if not exists kind text;

delete from public.template_unlocks where true;
delete from public.templates where true;

with raw(cat, name, tag, feats, board) as (values
('Lead Gen','LeadGen AI','Build high-converting lead funnels','AI headline tester;Multi-step form;CRM sync','')
,('Lead Gen','Funnelly','Turn visitors into booked calls','Calendar booking;Exit-intent offer;Email nurture','')
,('Lead Gen','Webinar Magnet','Fill every webinar seat','Countdown timer;One-click signup;Reminder emails','')
,('Lead Gen','QuoteFast','Instant quotes for home services','Quote calculator;Photo upload;SMS follow-up','')
,('Lead Gen','Ebook Capture','Grow your list with free guides','Gated download;Social proof;A/B variants','')
,('Lead Gen','Solar Leads','Qualify solar buyers in 60 seconds','Roof checker;Savings estimate;Installer match','')
,('Lead Gen','Agency Pitch','Win clients with a one-page pitch','Case studies;Booking widget;Testimonials','')
,('Lead Gen','Mortgage Match','Pre-qualify borrowers online','Rate calculator;Document checklist;Broker routing','')
,('Lead Gen','Gym Trial Pass','Sell free trial passes','Pass claim form;Class schedule;Referral bonus','')
,('Lead Gen','Dental Booker','Book new patients 24/7','Service picker;Insurance check;Reminder texts','')
,('Lead Gen','Course Waitlist','Launch with a waitlist that grows','Referral ladder;Progress bar;Launch emails','')
,('Lead Gen','Legal Intake','Capture and triage legal enquiries','Case questionnaire;Secure upload;Auto-reply','')
,('Lead Gen','Realtor Valuation','Free home valuation funnel','Address lookup;Instant range;Agent callback','')
,('Lead Gen','Newsletter Pro','Subscribers that actually read','Preview issues;Topic picker;Welcome series','')
,('Lead Gen','Event RSVP','Collect RSVPs with style','Guest list;Plus-one option;Calendar invite','')
,('Lead Gen','Coach Discovery','Book discovery calls with coaches','Fit quiz;Calendar booking;Client stories','')
,('Lead Gen','Insurance Compare','Compare plans and capture leads','Plan comparison;Quote form;Agent chat','')
,('Lead Gen','App Beta Signup','Recruit beta testers fast','Invite codes;Device survey;Slack invite','')
,('Lead Gen','Cleaning Quote','Instant cleaning estimates','Room counter;Date picker;Deposit link','')
,('Lead Gen','Podcast Guest Form','Collect great guest pitches','Pitch form;Topic tags;Auto-schedule','')
,('E-commerce','Aurora Store','Modern fashion storefront','Product grid;Size selector;Quick checkout','')
,('E-commerce','SneakerHub','Limited drops for sneakerheads','Drop countdown;Wishlist;Size alerts','')
,('E-commerce','Bloom Florist','Same-day flower delivery','Bouquet builder;Delivery slots;Gift notes','')
,('E-commerce','TechNest','Gadgets and accessories shop','Spec compare;Reviews;Bundle deals','')
,('E-commerce','Beanline Coffee','Subscription coffee roaster','Subscribe and save;Roast guide;Gift boxes','')
,('E-commerce','Luma Skincare','Clean beauty essentials','Skin quiz;Routine builder;Ingredient list','')
,('E-commerce','Homestead Decor','Warm furniture and decor','Room scenes;Swatches;Free shipping bar','')
,('E-commerce','PetPal Supplies','Everything for happy pets','Pet profile;Auto-reorder;Vet tips','')
,('E-commerce','Pageturner Books','Indie bookstore online','Staff picks;Reading lists;Signed editions','')
,('E-commerce','FitGear Pro','Athletic wear and equipment','Size guide;Workout bundles;Loyalty points','')
,('E-commerce','Jewel and Co','Handmade jewellery boutique','Gift engraving;Zoom gallery;Ring sizer','')
,('E-commerce','Fresh Basket','Groceries delivered fast','Aisle search;Recipes;Delivery tracking','')
,('E-commerce','Kidzone Toys','Playful toys and games','Age filter;Gift finder;Wishlist share','')
,('E-commerce','Vinyl Vault','Records and turntables','Pressing details;Preview clips;Pre-orders','')
,('E-commerce','Outdoor Peak','Camping and hiking gear','Gear checklist;Trip bundles;Reviews','')
,('E-commerce','Mobile Mart','Phones and accessories','Trade-in value;Case finder;Installments','')
,('E-commerce','Artisan Market','Marketplace for makers','Seller pages;Custom orders;Secure payments','')
,('E-commerce','Tea Atelier','Loose-leaf tea boutique','Flavour wheel;Sample packs;Brew timer','')
,('E-commerce','Print Studio','Custom printed merch','Live designer;Bulk pricing;Proof preview','')
,('E-commerce','Wine Cellar','Curated wines delivered','Taste profile;Pairings;Age check','')
,('SaaS','TaskFlow','Project management for teams','Kanban boards;Time tracking;Team chat','')
,('SaaS','InvoiceEasy','Invoicing for freelancers','Recurring bills;Payment links;Tax reports','')
,('SaaS','MetricsHQ','Analytics dashboards that make sense','Live charts;Alerts;Shared reports','')
,('SaaS','SupportDesk','Customer support inbox','Shared inbox;Macros;SLA timers','')
,('SaaS','HireLoop','Applicant tracking for startups','Pipeline view;Scorecards;Interview scheduling','')
,('SaaS','DocuSign Lite','E-signature made simple','Templates;Audit trail;Reminders','')
,('SaaS','FormForge','Drag and drop form builder','Logic jumps;Integrations;Response export','')
,('SaaS','ChatPilot','AI chatbot for your website','Knowledge base;Handoff to human;Analytics','')
,('SaaS','CalSync','Smart scheduling for teams','Round-robin;Buffer times;Video links','')
,('SaaS','CodeReview AI','Automated pull request reviews','Inline suggestions;Security scan;Team rules','')
,('SaaS','SocialPlanner','Social media post scheduler','Content calendar;Auto-publish;Engagement stats','')
,('SaaS','StockWatch','Inventory tracking for shops','Low-stock alerts;Barcode scan;Supplier orders','')
,('SaaS','HR Compass','People operations in one place','Leave requests;Payroll export;Org chart','')
,('SaaS','NoteNest','Collaborative notes and wikis','Nested pages;Real-time editing;Search','')
,('SaaS','UptimePulse','Website monitoring','Status page;Incident alerts;Response graphs','')
,('SaaS','SurveyBee','Surveys with instant insights','Question logic;Live results;Embeds','')
,('SaaS','LedgerLite','Bookkeeping for small business','Bank feeds;Receipt capture;Monthly reports','')
,('SaaS','ClassBoard','Learning management for schools','Gradebook;Assignments;Parent portal','')
,('SaaS','DevPortal','API documentation hub','Interactive docs;Key management;Usage graphs','')
,('SaaS','CRM Spark','Lightweight sales CRM','Deal pipeline;Email logging;Forecasts','')
,('Games','Tic-Tac-Toe','Classic 3x3 duel against a friend or AI','Two players;Smart AI mode;Win counter','grid:3')
,('Games','Flappy Bird','Tap to flap through the pipes','One-tap controls;Score streaks;Best score saved','arcade')
,('Games','Snake','Eat, grow and avoid your own tail','Arrow-key control;Speed levels;High scores','arcade')
,('Games','Chess','Full chess board with legal moves','Move validation;Timer clocks;Undo move','grid:8')
,('Games','Brick Breaker','Smash every brick with the ball','Paddle control;Power-ups;Level progression','arcade')
,('Games','2048','Slide and merge tiles to reach 2048','Swipe controls;Score tracking;Undo move','grid:4')
,('Games','Minesweeper','Clear the field without hitting mines','Flag mode;Difficulty levels;Timer','grid:8')
,('Games','Memory Match','Flip cards and find the pairs','Card flip animation;Move counter;Best time','grid:4')
,('Games','Tetris','Stack falling blocks and clear lines','Rotate and drop;Next piece preview;Level speed-up','arcade')
,('Games','Pong','Two-paddle retro table tennis','Player vs CPU;Ball speed ramp;First to 10','arcade')
,('Games','Sudoku','Fill the grid with digits 1 to 9','Pencil notes;Hints;Daily puzzle','grid:9')
,('Games','Connect Four','Drop discs and connect four in a row','Two players;Win highlight;Rematch button','grid:7')
,('Games','Hangman','Guess the word letter by letter','Word categories;Lives display;Hints','arcade')
,('Games','Wordle Clone','Guess the five-letter word in six tries','Colour feedback;Daily word;Share result','grid:5')
,('Games','Space Invaders','Defend Earth from alien waves','Shoot and dodge;Wave levels;Lives','arcade')
,('Games','Maze Runner','Escape the maze before time runs out','Random mazes;Timer;Level select','grid:9')
,('Games','Checkers','Classic draughts for two players','Forced captures;King promotion;Move history','grid:8')
,('Games','Whack-a-Mole','Hit the moles as they pop up','Random spawns;60-second rounds;Combo score','grid:3')
,('Games','Trivia Quiz','Test your knowledge across topics','Topic picker;Timed questions;Leaderboard','arcade')
,('Games','Dino Runner','Jump over cacti in the desert','Jump and duck;Day and night mode;Distance score','arcade')
), numbered as (
  select row_number() over () n, r.*, 
    (array['#c6ff3d','#7dd3fc','#f9a8d4','#fbbf24','#a78bfa','#34d399'])[1 + (abs(hashtext(r.name)) % 6)] accent,
    case r.cat when 'Lead Gen' then array['Landing','Funnel','Thank you']
               when 'E-commerce' then array['Home','Product','Cart']
               when 'SaaS' then array['Landing','Dashboard','Pricing']
               else array['Menu','Play','Scores'] end pages
  from raw r
)
insert into public.templates (id, name, category, thumbnail_url, prompt, base_users, sort_order, kind, spec)
select 't'||n, name, cat, '',
  'Build a '||(case cat when 'Lead Gen' then 'lead generation' when 'E-commerce' then 'e-commerce' when 'SaaS' then 'SaaS' else 'browser game' end)
  ||' website called "'||name||'". Headline: "'||tag||'". Pages, in this order: '||array_to_string(pages, ', ')||'. Features to show: '||replace(feats,';','; ')||'.'
  ||(case when board <> '' then ' Game board: '||board||'.' else '' end)
  ||' Style: dark background #0b0f0d, accent colour '||accent||', rounded cards, clean sans-serif type. Use exactly this headline, these pages and these features, nothing else.',
  1000 + (abs(hashtext(name||cat)) % 2800), n, cat,
  jsonb_build_object('name',name,'tagline',tag,'accent',accent,'features',to_jsonb(string_to_array(feats,';')),'pages',to_jsonb(pages),'board',board,'category',cat)
from numbered;

revoke select on public.templates from anon, authenticated;
grant select (id,name,category,thumbnail_url,base_users,sort_order,kind,spec) on public.templates to authenticated;
revoke insert, update, delete on public.templates from anon, authenticated;