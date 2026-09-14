// middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Rotas de API validam a sessão por conta própria.
  // Mantê-las fora do middleware evita refreshes concorrentes do mesmo
  // refresh token (o Supabase rotaciona e invalida os perdedores da corrida).
  if (path.startsWith("/api")) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: { name: string; value: string; options?: any }[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null; // sessão ilegível não derruba a navegação
  }

  const isLogin = path.startsWith("/login");

  if (!user && !isLogin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // IMPORTANTE: não redirecionamos /login -> /dashboard aqui.
  // Esse redirect fechava um loop quando a sessão oscilava entre requisições,
  // e impedia o usuário de chegar na tela de login para renovar o acesso.
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg)).*)",
  ],
};
