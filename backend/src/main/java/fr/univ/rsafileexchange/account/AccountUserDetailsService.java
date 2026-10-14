package fr.univ.rsafileexchange.account;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AccountUserDetailsService implements UserDetailsService {

    private final AccountRepository accountRepository;

    public AccountUserDetailsService(AccountRepository accountRepository) {
        this.accountRepository = accountRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        String normalizedEmail = AccountService.normalizeEmail(username);
        Account account = accountRepository.findByEmail(normalizedEmail)
                .orElseThrow(() -> new UsernameNotFoundException("Account not found"));
        return User.withUsername(account.emailNormalized())
                .password(account.passwordHash())
                .disabled(!account.isVerified())
                .authorities("ROLE_USER")
                .build();
    }
}
